import { kBand, type KBand } from './frequency'
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
      (!f.band || kBand(e.frequency) === f.band) &&
      (!f.mastery || e.mastery === f.mastery) &&
      (!f.source || alive(e.encounters).some((enc) => enc.source === f.source)),
  )
}

/** Notebook pages: words grouped by the day they were added, newest day first. */
export function groupByDay(entries: Entry[]): { day: string; entries: Entry[] }[] {
  const groups = new Map<string, Entry[]>()
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const entry of sorted) {
    const day = localDay(entry.createdAt)
    const list = groups.get(day)
    if (list) list.push(entry)
    else groups.set(day, [entry])
  }
  return [...groups].map(([day, entries]) => ({ day, entries }))
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
