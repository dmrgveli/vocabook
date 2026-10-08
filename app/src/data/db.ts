import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { now, normalizeWord, type Enrichment, type Entry } from './model'

// Local-first: every write goes to IndexedDB first. Sync (stage 3) builds on top of this.

interface NotebookDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: { word: string }
  }
}

let dbPromise: Promise<IDBPDatabase<NotebookDB>> | undefined

function db() {
  // The database keeps its original name: renaming it would hide existing notebooks.
  dbPromise ??= openDB<NotebookDB>('vocab-notebook', 1, {
    upgrade(db) {
      const store = db.createObjectStore('entries', { keyPath: 'id' })
      store.createIndex('word', 'word')
    },
  })
  return dbPromise
}

/** 'local' = the user changed something; 'sync' = changes pulled from the cloud. */
/** local = the user's edit (synced), sync = pulled from the cloud, cache = dictionary data (never synced). */
export type ChangeOrigin = 'local' | 'sync' | 'cache'
type Listener = (origin: ChangeOrigin) => void
const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(origin: ChangeOrigin = 'local') {
  listeners.forEach((l) => l(origin))
}

export async function listEntries(): Promise<Entry[]> {
  const all = await (await db()).getAll('entries')
  return all.filter((e) => !e.deletedAt)
}

/** Every record, including soft-deleted ones (sync needs the tombstones). */
export async function listAllEntries(): Promise<Entry[]> {
  return (await db()).getAll('entries')
}

/** Writes records pulled from the cloud exactly as they are (timestamps untouched). */
export async function applySyncedEntries(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return
  const tx = (await db()).transaction('entries', 'readwrite')
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
  notify('sync')
}

/** Removes records for good: tombstones old enough that every device has seen them. */
export async function purgeEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const tx = (await db()).transaction('entries', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  notify('sync')
}

/** Replaces the whole local notebook (used when switching to another account's notebook). */
export async function replaceAllEntries(entries: Entry[]): Promise<void> {
  const tx = (await db()).transaction('entries', 'readwrite')
  await tx.store.clear()
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
  notify('sync')
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const entry = await (await db()).get('entries', id)
  return entry && !entry.deletedAt ? entry : undefined
}

export async function findByWord(word: string): Promise<Entry | undefined> {
  const matches = await (await db()).getAllFromIndex('entries', 'word', normalizeWord(word))
  return matches.find((e) => !e.deletedAt)
}

export async function putEntry(entry: Entry): Promise<void> {
  await (await db()).put('entries', { ...entry, updatedAt: now() })
  notify()
}

/** Updates an entry; updatedAt is refreshed automatically. */
export async function updateEntry(id: string, change: (entry: Entry) => Entry): Promise<Entry | undefined> {
  const entry = await getEntry(id)
  if (!entry) return undefined
  const next = { ...change(entry), updatedAt: now() }
  await (await db()).put('entries', next)
  notify()
  return next
}

/**
 * Stores dictionary data in an entry. It is a per-device cache, not an edit: updatedAt
 * stays, so filling it in does not make the entry "newer" or trigger a sync.
 */
export async function cacheEnrichment(id: string, enrichment: Enrichment, frequency?: number): Promise<void> {
  const entry = await getEntry(id)
  if (!entry) return
  await (await db()).put('entries', { ...entry, enrichment, frequency: entry.frequency ?? frequency })
  notify('cache')
}

/** Adds late dictionary extras (recording, origin) to an entry's cached data. Same rules as cacheEnrichment. */
export async function patchEnrichment(id: string, patch: Partial<Enrichment>): Promise<void> {
  const entry = await getEntry(id)
  if (!entry?.enrichment) return
  await (await db()).put('entries', { ...entry, enrichment: { ...entry.enrichment, ...patch } })
  notify('cache')
}

/** Soft delete: the record stays so sync can carry the deletion to other devices. */
export async function deleteEntry(id: string): Promise<void> {
  await updateEntry(id, (e) => ({ ...e, deletedAt: now() }))
}

/** Records when the word page was opened; does not touch updatedAt (content did not change). */
export async function markViewed(id: string): Promise<void> {
  const entry = await getEntry(id)
  if (!entry) return
  await (await db()).put('entries', { ...entry, lastViewedAt: now() })
}
