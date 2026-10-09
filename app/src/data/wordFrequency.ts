import { useSyncExternalStore } from 'react'
import { normalizeWord } from './model'

// How often a word is used, from the web corpus (occurrences per million words), for the
// words whose rich data has been fetched. Shown next to the K level in the badge's tip.
// (The K level itself stays with the BNC/COCA family lists: the corpus account cannot
// rank words beyond the first 1,000.)

const perMillion = new Map<string, number>()
let version = 0
const listeners = new Set<() => void>()

export function setWordFrequencies(values: [word: string, perMillion: number | undefined][]) {
  let changed = false
  for (const [word, value] of values) {
    const w = normalizeWord(word)
    if (value === undefined || !Number.isFinite(value) || perMillion.get(w) === value) continue
    perMillion.set(w, value)
    changed = true
  }
  if (!changed) return
  version++
  listeners.forEach((l) => l())
}

export function useWordFrequency(word: string): number | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return perMillion.get(normalizeWord(word))
}

/** "Used about 14 times per million words" / "about once in every 3 million words". */
export function describeFrequency(value: number): string {
  if (value >= 1) return `Used about ${Math.round(value).toLocaleString('en-US')} times per million words`
  return `Used about once in every ${Math.round(1 / value).toLocaleString('en-US')} million words`
}
