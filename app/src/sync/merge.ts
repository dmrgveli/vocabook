import { MASTERY_LEVELS, now, type Entry } from '../data/model'

// Merging two copies of the notebook (this device and the cloud). Pure functions.
//
// - Entries match by id; the newer `updatedAt` wins for the entry's own fields.
// - Encounters and margin notes merge one by one (newer wins per id), so adding an
//   encounter on two devices keeps both.
// - Deletions are tombstones (`deletedAt`) and win like any other newer change.
// - The same word added on two devices before they synced ends up as one entry:
//   the oldest keeps its id, the others fold into it and become tombstones.
// - Dictionary data (`enrichment`) is a per-device cache: never sent, never overwritten.
// - Tombstones are dropped once they are older than TOMBSTONE_DAYS (pruneTombstones):
//   by then every device that syncs regularly has seen the deletion. A device that was
//   offline for longer may bring such a word back; that is the price of not keeping
//   deletions forever, and it never loses a word.

export interface SyncedNotebook {
  version: 1
  entries: Entry[]
}

type Stamped = { id: string; updatedAt: string }

const newer = <T extends { updatedAt: string }>(a: T, b: T): T => (b.updatedAt > a.updatedAt ? b : a)

function mergeById<T extends Stamped>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of [...a, ...b]) {
    const seen = byId.get(item.id)
    byId.set(item.id, seen ? newer(seen, item) : item)
  }
  return [...byId.values()]
}

const maxDefined = (a?: string, b?: string) => (a && b ? (a > b ? a : b) : (a ?? b))

function mergeEntry(local: Entry, remote: Entry): Entry {
  const base = newer(local, remote)
  return {
    ...base,
    encounters: mergeById(local.encounters, remote.encounters),
    notes: mergeById(local.notes, remote.notes),
    lastViewedAt: maxDefined(local.lastViewedAt, remote.lastViewedAt),
    enrichment: local.enrichment,
  }
}

const masteryRank = (e: Entry) => MASTERY_LEVELS.indexOf(e.mastery)

/** Folds entries for the same word into the oldest one. */
function dedupeWords(entries: Entry[]): Entry[] {
  const byWord = new Map<string, Entry[]>()
  for (const e of entries) {
    if (e.deletedAt) continue
    byWord.set(e.word, [...(byWord.get(e.word) ?? []), e])
  }
  const replaced = new Map<string, Entry>()
  for (const group of byWord.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    const [keep, ...rest] = group
    const t = now()
    let merged: Entry = { ...keep }
    for (const other of rest) {
      merged = {
        ...merged,
        translation: merged.translation ?? other.translation,
        ownSentence: merged.ownSentence ?? other.ownSentence,
        frequency: merged.frequency ?? other.frequency,
        enrichment: merged.enrichment ?? other.enrichment,
        mastery: masteryRank(other) > masteryRank(merged) ? other.mastery : merged.mastery,
        encounters: mergeById(merged.encounters, other.encounters),
        notes: mergeById(merged.notes, other.notes),
        tags: [...new Set([...merged.tags, ...other.tags])],
        lastViewedAt: maxDefined(merged.lastViewedAt, other.lastViewedAt),
      }
      replaced.set(other.id, { ...other, deletedAt: t, updatedAt: t })
    }
    replaced.set(keep.id, { ...merged, updatedAt: t })
  }
  return entries.map((e) => replaced.get(e.id) ?? e)
}

export function mergeNotebooks(local: Entry[], remote: Entry[]): Entry[] {
  const byId = new Map(local.map((e) => [e.id, e]))
  for (const r of remote) {
    const l = byId.get(r.id)
    byId.set(r.id, l ? mergeEntry(l, r) : r)
  }
  return dedupeWords([...byId.values()])
}

/** How long a deletion is kept so other devices can learn about it. */
export const TOMBSTONE_DAYS = 60

/**
 * Removes deleted entries, encounters and notes whose deletion is older than the cutoff.
 * Deterministic (it depends only on deletedAt), so every device prunes the same records.
 */
export function pruneTombstones(entries: Entry[], nowMs: number, days = TOMBSTONE_DAYS): { entries: Entry[]; purged: string[] } {
  const cutoff = new Date(nowMs - days * 86_400_000).toISOString()
  const expired = (x: { deletedAt?: string }) => Boolean(x.deletedAt && x.deletedAt < cutoff)
  const purged: string[] = []
  const kept: Entry[] = []
  for (const e of entries) {
    if (expired(e)) {
      purged.push(e.id)
      continue
    }
    const encounters = e.encounters.filter((x) => !expired(x))
    const notes = e.notes.filter((x) => !expired(x))
    kept.push(encounters.length === e.encounters.length && notes.length === e.notes.length ? e : { ...e, encounters, notes })
  }
  return { entries: kept, purged }
}

/** What goes to the cloud: no dictionary cache; deleted entries shrink to a tombstone. */
export function toWire(entry: Entry): Entry {
  const { enrichment: _cache, ...rest } = entry
  if (!entry.deletedAt) return rest
  return {
    id: entry.id,
    word: entry.word,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    mastery: entry.mastery,
    encounters: [],
    notes: [],
    tags: [],
  }
}

/** JSON with sorted keys and without undefined values, for change detection. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  )
}

export function wireNotebook(entries: Entry[]): SyncedNotebook {
  return { version: 1, entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)).map(toWire) }
}

/** Entries whose merged version differs from what this device has stored. */
export function changedLocally(local: Entry[], merged: Entry[]): Entry[] {
  const before = new Map(local.map((e) => [e.id, stableStringify(e)]))
  return merged.filter((e) => before.get(e.id) !== stableStringify(e))
}
