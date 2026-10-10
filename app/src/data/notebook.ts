import { bandOfWord, type KBand } from './levels'
import { exposureLevel, exposureOf, type ExposureLevel } from './exposure'
import { alive, firstEncounter, metEncounters, type Entry } from './model'

export interface Filters {
  query: string
  band?: KBand
  exposure?: ExposureLevel
  source?: string
}

export const EMPTY_FILTERS: Filters = { query: '' }

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.query.trim() || f.band || f.exposure || f.source)
}

/** Where a search found the word, for a small hint next to it ("in a definition"). */
export type SearchField = 'word' | 'translation' | 'my sentence' | 'a note' | 'where you met it' | 'a definition' | 'an example' | 'related words' | 'a phrase'

export interface SearchHit {
  score: number
  field: SearchField
}

/**
 * Searches everything a notebook line knows about a word, best match first: the word itself
 * (whole, start, inside), your translation, your sentence and notes, where you met it (place
 * and sentence), its definitions and examples, related words and the phrases it's used in.
 */
export function searchEntry(entry: Entry, query: string): SearchHit | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  // The translation and notes may be Turkish: compare those with Turkish casing rules too.
  const qTr = query.trim().toLocaleLowerCase('tr')
  const has = (text: string | undefined) => !!text && (text.toLowerCase().includes(q) || text.toLocaleLowerCase('tr').includes(qTr))
  const w = entry.word
  if (w === q) return { score: 100, field: 'word' }
  if (w.startsWith(q)) return { score: 90, field: 'word' }
  if (w.includes(q)) return { score: 80, field: 'word' }
  if (has(entry.translation)) return { score: 70, field: 'translation' }
  if (has(entry.ownSentence)) return { score: 60, field: 'my sentence' }
  if (alive(entry.notes).some((n) => has(n.text))) return { score: 55, field: 'a note' }
  if (metEncounters(entry).some((e) => has(e.source) || has(e.sentence))) return { score: 50, field: 'where you met it' }
  const en = entry.enrichment
  if (!en) return undefined
  const defs = en.meanings.flatMap((m) => m.definitions)
  if (defs.some((d) => has(d.definition))) return { score: 40, field: 'a definition' }
  if (defs.some((d) => has(d.example)) || en.corpus?.examples.some((x) => has(`${x.before} ${x.word} ${x.after}`))) return { score: 30, field: 'an example' }
  if ([...en.synonyms, ...en.antonyms, ...(en.corpus?.similar ?? [])].some((x) => x.toLowerCase() === q || x.toLowerCase().startsWith(q)))
    return { score: 25, field: 'related words' }
  if (en.corpus?.groups.some((g) => g.items.some((i) => has(i.phrase)))) return { score: 20, field: 'a phrase' }
  return undefined
}

export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  const q = f.query.trim()
  const scored = entries
    .filter(
      (e) =>
        (!f.band || bandOfWord(e.word) === f.band) &&
        (!f.exposure || exposureLevel(e) === f.exposure) &&
        (!f.source || metEncounters(e).some((enc) => enc.source === f.source)),
    )
    .map((e) => ({ e, hit: q ? searchEntry(e, q) : undefined }))
  return (q ? scored.filter((x) => x.hit) : scored).map((x) => x.e)
}

/** While searching, the best matches come first (stable: ties keep the chosen sort). */
export function rankBySearch(sorted: Entry[], query: string): Entry[] {
  if (!query.trim()) return sorted
  const score = new Map(sorted.map((e) => [e.id, searchEntry(e, query)?.score ?? 0]))
  return [...sorted].sort((a, b) => score.get(b.id)! - score.get(a.id)!)
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
    for (const enc of metEncounters(entry)) {
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
  { id: 'least-exposed', label: 'Least familiar first' },
  { id: 'unseen', label: 'Not seen lately' },
] as const
export type SortKey = (typeof SORTS)[number]['id']

export const GROUPS = [
  { id: 'day', label: 'Day added' },
  { id: 'source', label: 'Source' },
  { id: 'level', label: 'How common' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'none', label: 'No groups' },
] as const
export type GroupKey = (typeof GROUPS)[number]['id']

/** Numeric level for sorting: 1–25, words off the lists after them, unknown last. */
export type LevelOf = (word: string) => number | undefined

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
    'least-exposed': (a, b) => exposureOf(a).points - exposureOf(b).points || lastSeen(a).localeCompare(lastSeen(b)),
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
 * Just met → Old friend.
 */
export function groupEntries(sorted: Entry[], group: GroupKey, bandOf: (word: string) => string | undefined): Group[] {
  if (group === 'none') return sorted.length ? [{ key: 'all', entries: sorted }] : []
  const keyOf: Record<Exclude<GroupKey, 'none'>, (e: Entry) => string> = {
    day: (e) => localDay(e.createdAt),
    source: (e) => entrySource(e) ?? '',
    level: (e) => bandOf(e.word) ?? 'unknown',
    exposure: (e) => String(exposureLevel(e)),
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
    exposure: (a, b) => Number(a) - Number(b),
  }
  return [...groups.keys()].sort(order[group]).map((key) => ({ key, entries: groups.get(key)! }))
}

const BAND_ORDER = ['k1', 'k3', 'k5', 'k10', 'k20', 'rare', 'unknown']

/* ---------- what a notebook line shows ---------- */

/**
 * The phrases a word is most used in, for its line in the notebook: one from each kind of
 * corpus collocation first ("make a decision", "final decision"), else the classic
 * neighbours by frequency ("thrive on", "plants thrive").
 */
export function topPhrases(entry: Entry, max = 3): string[] {
  const out: string[] = []
  const groups = entry.enrichment?.corpus?.groups ?? []
  for (let round = 0; round < 3 && out.length < max; round++) {
    for (const g of groups) {
      const phrase = g.items[round]?.phrase
      if (phrase && out.length < max && !out.includes(phrase)) out.push(phrase)
    }
  }
  if (out.length) return out
  const c = entry.enrichment?.collocations
  if (!c) return []
  return [
    ...c.before.map((x) => ({ phrase: `${x.word} ${entry.word}`, score: x.score ?? 0 })),
    ...c.after.map((x) => ({ phrase: `${entry.word} ${x.word}`, score: x.score ?? 0 })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.phrase)
}

/** One sentence with the word: your own first, then where you met it, then a real or dictionary example. */
export function lineSentence(entry: Entry): { text: string; mine: boolean } | undefined {
  if (entry.ownSentence?.trim()) return { text: entry.ownSentence.trim(), mine: true }
  const met = firstEncounter(entry)?.sentence?.trim() || metEncounters(entry).find((e) => e.sentence?.trim())?.sentence?.trim()
  if (met) return { text: met, mine: true }
  const real = entry.enrichment?.corpus?.examples[0]
  if (real) return { text: `${real.before} ${real.word}${/^[.,;:!?'’)]/.test(real.after) ? '' : ' '}${real.after}`.trim(), mine: false }
  for (const m of entry.enrichment?.meanings ?? []) {
    const example = m.definitions.find((d) => d.example)?.example
    if (example) return { text: example, mine: false }
  }
  return undefined
}

/** The first `n` entries across the groups, keeping each group's full size for its label. */
export function takeFirst(groups: Group[], n: number): (Group & { total: number })[] {
  const out: (Group & { total: number })[] = []
  let left = n
  for (const g of groups) {
    if (left <= 0) break
    out.push({ key: g.key, entries: g.entries.slice(0, left), total: g.entries.length })
    left -= g.entries.length
  }
  return out
}
