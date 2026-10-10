import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { now, normalizeWord, type Enrichment, type Entry } from './model'

// Local-first: every write goes to IndexedDB first; sync builds on top of this.
//
// One notebook per identity on this device. The guest (not signed in) keeps the original
// database; every Google account gets its own. Signing out shows the guest's words again,
// signing in shows that account's: synced words never leak into the signed-out notebook.

interface NotebookDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: { word: string }
  }
}

/** The guest notebook keeps the original name: renaming it would hide existing notebooks. */
const GUEST_DB = 'vocab-notebook'
const accountDb = (sub: string) => `vocab-notebook-${sub}`

/** Before notebooks were split, the one database held the signed-in account's words. */
const LEGACY_ACCOUNT_KEY = 'last-synced-account'
const migratedKey = (sub: string) => `notebook-split:${sub}`

/** Who the device was signed in as when the page loaded (auth.ts restores the same identity). */
function initialProfile(): string | null {
  try {
    const session = JSON.parse(localStorage.getItem('sync-session') ?? 'null') as { user?: { sub?: string }; expires?: number } | null
    if (session?.user?.sub && (session.expires ?? 0) > Date.now()) return session.user.sub
    const hint = JSON.parse(localStorage.getItem('signed-in-hint') ?? 'null') as { sub?: string } | null
    return hint?.sub ?? null
  } catch {
    return null
  }
}

let profile: string | null = initialProfile()
let dbPromise: Promise<IDBPDatabase<NotebookDB>> | undefined
let openName: string | undefined

function open(name: string) {
  return openDB<NotebookDB>(name, 1, {
    upgrade(db) {
      const store = db.createObjectStore('entries', { keyPath: 'id' })
      store.createIndex('word', 'word')
    },
  })
}

/**
 * First time an account's notebook is opened on a device that used the single shared
 * notebook: if that shared notebook was synced with this account, its words move into
 * the account's notebook and the guest notebook starts empty.
 */
async function migrateLegacy(target: IDBPDatabase<NotebookDB>, sub: string) {
  try {
    if (localStorage.getItem(migratedKey(sub))) return
    if (localStorage.getItem(LEGACY_ACCOUNT_KEY) === sub) {
      const guest = await open(GUEST_DB)
      const words = await guest.getAll('entries')
      const tx = target.transaction('entries', 'readwrite')
      await Promise.all([...words.map((e) => tx.store.put(e)), tx.done])
      await guest.clear('entries')
      guest.close()
      localStorage.removeItem(LEGACY_ACCOUNT_KEY)
    }
    localStorage.setItem(migratedKey(sub), '1')
  } catch {
    // storage unavailable: nothing to move
  }
}

function db() {
  const name = profile ? accountDb(profile) : GUEST_DB
  if (openName !== name) {
    const previous = dbPromise
    void previous?.then((d) => d.close())
    const sub = profile
    openName = name
    dbPromise = open(name).then(async (d) => {
      if (sub) await migrateLegacy(d, sub)
      return d
    })
  }
  return dbPromise!
}

/** The account whose notebook is showing; null = the guest's. */
export function activeProfile(): string | null {
  return profile
}

/** Switches the notebook on screen (sign-in, sign-out). Everything reloads from the new one. */
export function switchProfile(sub: string | null) {
  if (sub === profile) return
  profile = sub
  void db().then(() => notify('sync'))
}

/** The guest's words, for offering to add them to an account after signing in. */
export async function listGuestEntries(): Promise<Entry[]> {
  const guest = profile ? await open(GUEST_DB) : await db()
  const all = await guest.getAll('entries')
  if (profile) guest.close()
  return all.filter((e) => !e.deletedAt)
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

// A look counts once per word in ten minutes: going back and forth to a page is one look.
const LOOK_GAP = 10 * 60_000
const lastCounted = new Map<string, number>()

/**
 * Records when the word was looked at; does not touch updatedAt (content did not change).
 * `count`: a real look (the word page, a reminder), added to the word's views for exposure.
 */
export async function markViewed(id: string, count = false): Promise<void> {
  const entry = await getEntry(id)
  if (!entry) return
  const t = Date.now()
  const counts = count && t - (lastCounted.get(id) ?? 0) > LOOK_GAP
  if (counts) lastCounted.set(id, t)
  await (await db()).put('entries', { ...entry, lastViewedAt: now(), ...(counts && { views: (entry.views ?? 0) + 1 }) })
  if (counts) notify('cache')
}

/** Changes several entries in one go (bulk actions); one notification for all of them. */
export async function updateEntries(ids: string[], change: (entry: Entry) => Entry): Promise<void> {
  if (ids.length === 0) return
  const tx = (await db()).transaction('entries', 'readwrite')
  const t = now()
  for (const id of ids) {
    const entry = await tx.store.get(id)
    if (entry && !entry.deletedAt) await tx.store.put({ ...change(entry), updatedAt: t })
  }
  await tx.done
  notify()
}

/** Undoes a delete: the tombstone is lifted (with a new updatedAt, so sync brings the word back everywhere). */
export async function restoreEntries(ids: string[]): Promise<void> {
  const tx = (await db()).transaction('entries', 'readwrite')
  const t = now()
  for (const id of ids) {
    const entry = await tx.store.get(id)
    if (entry?.deletedAt) {
      const { deletedAt: _, ...alive } = entry
      await tx.store.put({ ...alive, updatedAt: t })
    }
  }
  await tx.done
  notify()
}
