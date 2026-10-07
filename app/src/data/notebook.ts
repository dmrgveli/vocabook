import { bandOfWord, type KBand } from './levels'
import { alive, firstEncounter, type Entry, type Mastery } from './model'

export interface Filters {
  query: string
  band?: KBand
  mastery?: Mastery
  source?: string
}

export const EMPTY_FILTERS: Filters = { query: '' }

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.query.trim() || f.band || f.mastery || f.source)
}

function matchesQuery(entry: Entry, q: string, qTr: string): boolean {
  if (entry.word.includes(q)) return true
  // The translation is in the user's native language (Turkish): compare with Turkish casing rules.
  if (entry.translation?.toLocaleLowerCase('tr').includes(qTr)) return true
  if (entry.ownSentence?.toLowerCase().includes(q)) return true
  return alive(entry.notes).some((n) => n.text.toLowerCase().includes(q) || n.text.toLocaleLowerCase('tr').includes(qTr))
}

export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  const q = f.query.trim().toLowerCase()
  const qTr = f.query.trim().toLocaleLowerCase('tr')
  return entries.filter(
    (e) =>
      (!q || matchesQuery(e, q, qTr)) &&
      (!f.band || bandOfWord(e.word) === f.band) &&
      (!f.mastery || e.mastery === f.mastery) &&
      (!f.source || alive(e.encounters).some((enc) => enc.source === f.source)),
  )
}

/** YYYY-MM-DD in local time */
export function localDay(timestamp: string): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Sources with how many words they contain, most recently used first. */
export function allSources(entries: Entry[]): { source: string; count: number }[] {
  const stats = new Map<string, { latest: string; words: Set<string> }>()
  for (const entry of entries) {
    for (const enc of alive(entry.encounters)) {
      if (!enc.source) continue
      const s = stats.get(enc.source) ?? { latest: '', words: new Set() }
      if (enc.createdAt > s.latest) s.latest = enc.createdAt
      s.words.add(entry.id)
      stats.set(enc.source, s)
    }
  }
  return [...stats]
    .sort((a, b) => b[1].latest.localeCompare(a[1].latest))
    .map(([source, s]) => ({ source, count: s.words.size }))
}

export function entrySource(entry: Entry): string | undefined {
  return firstEncounter(entry)?.source
}

/* ---------- sorting and grouping ---------- */

export const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
  { id: 'common', label: 'Most common first' },
  { id: 'rare', label: 'Rarest first' },
  { id: 'least-known', label: 'Least known first' },
  { id: 'unseen', label: 'Not seen lately' },
] as const
export type SortKey = (typeof SORTS)[number]['id']

export const GROUPS = [
  { id: 'day', label: 'Day added' },
  { id: 'source', label: 'Source' },
  { id: 'level', label: 'How common' },
  { id: 'mastery', label: 'How well I know it' },
  { id: 'none', label: 'No groups' },
] as const
export type GroupKey = (typeof GROUPS)[number]['id']

/** Numeric level for sorting: 1–25, words off the lists after them, unknown last. */
export type LevelOf = (word: string) => number | undefined

const MASTERY_ORDER = { recognize: 0, understand: 1, use: 2 } as const
const lastSeen = (e: Entry) => e.lastViewedAt ?? e.createdAt

export function sortEntries(entries: Entry[], sort: SortKey, levelOf: LevelOf): Entry[] {
  const level = (e: Entry) => levelOf(e.word) ?? Infinity
  const byNewest = (a: Entry, b: Entry) => b.createdAt.localeCompare(a.createdAt)
  const compare: Record<SortKey, (a: Entry, b: Entry) => number> = {
    newest: byNewest,
    oldest: (a, b) => -byNewest(a, b),
    az: (a, b) => a.word.localeCompare(b.word, 'en'),
    za: (a, b) => b.word.localeCompare(a.word, 'en'),
    common: (a, b) => level(a) - level(b) || byNewest(a, b),
    rare: (a, b) => level(b) - level(a) || byNewest(a, b),
    'least-known': (a, b) => MASTERY_ORDER[a.mastery] - MASTERY_ORDER[b.mastery] || lastSeen(a).localeCompare(lastSeen(b)),
    unseen: (a, b) => lastSeen(a).localeCompare(lastSeen(b)),
  }
  return [...entries].sort(compare[sort])
}

export interface Group {
  /** Stable key; for 'day' a YYYY-MM-DD date, for 'level' a band id, etc. */
  key: string
  entries: Entry[]
}

/**
 * Splits already-sorted entries into groups, keeping the sort inside each group.
 * Groups come in a natural order: newest day, most recently used source, 1K → 25K+,
 * Seen it → Use it.
 */
export function groupEntries(sorted: Entry[], group: GroupKey, bandOf: (word: string) => string | undefined): Group[] {
  if (group === 'none') return sorted.length ? [{ key: 'all', entries: sorted }] : []
  const keyOf: Record<Exclude<GroupKey, 'none'>, (e: Entry) => string> = {
    day: (e) => localDay(e.createdAt),
    source: (e) => entrySource(e) ?? '',
    level: (e) => bandOf(e.word) ?? 'unknown',
    mastery: (e) => e.mastery,
  }
  const groups = new Map<string, Entry[]>()
  for (const e of sorted) {
    const k = keyOf[group](e)
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const order: Record<Exclude<GroupKey, 'none'>, (a: string, b: string) => number> = {
    day: (a, b) => b.localeCompare(a),
    source: (a, b) => {
      const recent = (k: string) => Math.max(...groups.get(k)!.map((e) => Date.parse(e.createdAt)))
      return (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || recent(b) - recent(a)
    },
    level: (a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b),
    mastery: (a, b) => MASTERY_ORDER[a as Mastery] - MASTERY_ORDER[b as Mastery],
  }
  return [...groups.keys()].sort(order[group]).map((key) => ({ key, entries: groups.get(key)! }))
}

const BAND_ORDER = ['k1', 'k3', 'k5', 'k10', 'k20', 'rare', 'unknown']
