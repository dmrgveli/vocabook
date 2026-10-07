import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { now, normalizeWord, type Entry } from './model'

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
  dbPromise ??= openDB<NotebookDB>('vocab-notebook', 1, {
    upgrade(db) {
      const store = db.createObjectStore('entries', { keyPath: 'id' })
      store.createIndex('word', 'word')
    },
  })
  return dbPromise
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  listeners.forEach((l) => l())
}

export async function listEntries(): Promise<Entry[]> {
  const all = await (await db()).getAll('entries')
  return all.filter((e) => !e.deletedAt)
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
