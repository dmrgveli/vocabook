import { useSyncExternalStore } from 'react'
import { normalizeWord } from './model'

// "K" levels from Paul Nation's BNC/COCA word family lists: a word is "4K" when its
// word family is among the 4th thousand most frequent families (Nation 2017, CC BY-SA 4.0).
// Families follow Bauer & Nation level 6, so "thriving" shares "thrive"'s level.
// The table is public/bnc-coca-levels.json, built by scripts/build-levels.mjs.

export const MAX_LEVEL = 25

export interface WordLevel {
  /** 1–25 = thousand of word families; 'off' = not in the 25,000 families. */
  level: number | 'off'
  /** The family's head word when it differs from the word ("thriving" → "thrive"). */
  family?: string
}

interface FamilyEntry {
  level: number
  head: string
}

let table: Map<string, FamilyEntry> | undefined
let compounds: Set<string> | undefined
let loading: Promise<void> | undefined
const listeners = new Set<() => void>()

/** Parses the JSON produced by build-levels.mjs. Exported for tests. */
export function buildTable(data: { levels: string[]; compounds: string }) {
  const map = new Map<string, FamilyEntry>()
  data.levels.forEach((list, i) => {
    for (const family of list.split(';')) {
      const [head, ...members] = family.split(' ')
      for (const form of [head, ...members]) if (!map.has(form)) map.set(form, { level: i + 1, head })
    }
  })
  const compoundForms = new Set(data.compounds.split(/[; ]/).filter(Boolean))
  return { map, compounds: compoundForms }
}

export function loadLevels(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}bnc-coca-levels.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      const built = buildTable(data)
      table = built.map
      compounds = built.compounds
      listeners.forEach((l) => l())
    })
    .catch(() => {
      loading = undefined // try again next time something asks
    })
  return loading
}

/** Re-renders once the table has loaded; returns whether it is ready. */
export function useLevelsReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      void loadLevels()
      return () => listeners.delete(l)
    },
    () => table !== undefined,
  )
}

/** Splits a closed compound ("absentminded") into two known parts, if it can. */
function splitCompound(word: string, map: Map<string, FamilyEntry>): string[] | undefined {
  for (let i = 2; i <= word.length - 2; i++) {
    const a = word.slice(0, i)
    const b = word.slice(i)
    if (map.has(a) && map.has(b)) return [a, b]
  }
  return undefined
}

/**
 * The level of a word, or undefined while the table is loading.
 * Phrases ("look for"), hyphenated words and transparent compounds take the level of
 * their hardest part: if you know the parts, you can understand the whole.
 */
export function levelOf(word: string, lookup: { map: Map<string, FamilyEntry>; compounds: Set<string> } | undefined = table && compounds ? { map: table, compounds } : undefined): WordLevel | undefined {
  if (!lookup) return undefined
  const w = normalizeWord(word)
  const direct = lookup.map.get(w)
  if (direct) return { level: direct.level, family: direct.head !== w ? direct.head : undefined }

  const parts = w.split(/[\s-]+/).filter(Boolean)
  const pieces = parts.length > 1 ? parts : lookup.compounds.has(w) ? splitCompound(w, lookup.map) : undefined
  if (pieces && pieces.every((p) => lookup.map.has(p))) {
    return { level: Math.max(...pieces.map((p) => lookup.map.get(p)!.level)) }
  }
  return { level: 'off' }
}

export function formatLevel(l: WordLevel): string {
  return l.level === 'off' ? `${MAX_LEVEL}K+` : `${l.level}K`
}

export function describeLevel(l: WordLevel): string {
  return l.level === 'off'
    ? `Not among the ${(MAX_LEVEL * 1000).toLocaleString('en-US')} most common word families`
    : `Among the ${(l.level * 1000).toLocaleString('en-US')} most common word families`
}

/** Groups of thousands used for colours and filters. */
export const K_BANDS = [
  { id: 'k1', label: '1K', max: 1 },
  { id: 'k3', label: '2–3K', max: 3 },
  { id: 'k5', label: '4–5K', max: 5 },
  { id: 'k10', label: '6–10K', max: 10 },
  { id: 'k20', label: '11–20K', max: 20 },
  { id: 'rare', label: '20K+', max: Infinity },
] as const

export type KBand = (typeof K_BANDS)[number]['id']

export function bandOf(l: WordLevel | undefined): KBand | undefined {
  if (!l) return undefined
  if (l.level === 'off') return 'rare'
  const level = l.level
  return K_BANDS.find((b) => level <= b.max)!.id
}

/** Band of a word straight from the loaded table (undefined while loading). */
export function bandOfWord(word: string): KBand | undefined {
  return bandOf(levelOf(word))
}
