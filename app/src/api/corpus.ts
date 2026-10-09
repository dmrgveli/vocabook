import { useSyncExternalStore } from 'react'
import type { CollocationGroup, CorpusData, CorpusExample } from '../data/model'
import { setWordFrequencies } from '../data/wordFrequency'
import { SYNC_BASE } from '../sync/auth'

// Richer word data from Sketch Engine's English Web corpus (52 billion words), fetched
// through our Worker (which keeps the API key and caches every word for all users):
//  - collocations by grammar: "make / reach a decision", "commit a crime", "thrive on"
//  - good example sentences from real use (GDEX)
//  - similar words (distributional thesaurus)
//  - how two similar words are used differently (sketch difference)
// No sign-in needed. Switched off in Settings, offline, or when the daily budget is used
// up, the word page keeps the classic data.

/* ---------- the switch in Settings ---------- */

export type WordSource = 'rich' | 'classic'
const SOURCE_KEY = 'word-source'
const listeners = new Set<() => void>()

function readSource(): WordSource {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'classic' ? 'classic' : 'rich'
  } catch {
    return 'rich'
  }
}

let source = readSource()

export function setWordSource(next: WordSource) {
  source = next
  try {
    if (next === 'classic') localStorage.setItem(SOURCE_KEY, next)
    else localStorage.removeItem(SOURCE_KEY)
  } catch {
    // storage unavailable: the choice lasts for this session
  }
  listeners.forEach((l) => l())
}

export function useWordSource(): WordSource {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => source,
  )
}

/** Rich data can be asked for: switched on and the Worker is set up. */
export function corpusAvailable(): boolean {
  return source === 'rich' && Boolean(SYNC_BASE)
}

/* ---------- what the Worker sends ---------- */

export interface RawWord {
  lemma: string
  pos: string
  perMillion?: number
  rels: { name: string; items: { w: string; p: string; s: number }[] }[]
  examples: { l: string; k: string; r: string }[]
  similar: { w: string; s: number }[]
}

export interface RawDiff {
  a: string
  b: string
  rels: { name: string; rows: { w: string; a: number; b: number; ca: number; cb: number }[] }[]
}

/* ---------- shaping it for the page (pure, tested) ---------- */

/** Puts the corpus's token spacing right: "word , word" → "word, word", "it 's" → "it's". */
export function tidy(text: string): string {
  return text
    .replace(/\s+([.,;:!?%)\]}])/g, '$1')
    .replace(/([([{$])\s+/g, '$1')
    .replace(/\s+(['’](?:s|re|ve|ll|d|m|t)\b)/gi, '$1')
    .replace(/\s+(n['’]t)\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const PREPOSITIONS = /^(\.\.\. [a-z]+ "%w"|"%w" [a-z]+ \.\.\.|particles after "%w"( with object)?|objects of "%w [a-z]+")$/

const GROUP_ORDER = [
  'adjectives',
  'objects',
  'verbs-before',
  'phrasal',
  'nouns-after',
  'adverbs',
  'prepositions',
  'subjects',
  'verbs-after',
  'described',
  'and-or',
] as const
type GroupId = (typeof GROUP_ORDER)[number]

const LABELS: Record<GroupId, string> = {
  adjectives: 'Adjectives',
  objects: 'Objects',
  'verbs-before': 'Verbs before',
  phrasal: 'Phrasal verbs',
  'nouns-after': 'Nouns after',
  adverbs: 'Adverbs',
  prepositions: 'With prepositions',
  subjects: 'Subjects',
  'verbs-after': 'Verbs after',
  described: 'Often described',
  'and-or': 'And / or',
}

/** Which of our groups a Sketch Engine grammatical relation belongs to, if any. */
export function groupOf(relation: string, pos: string): GroupId | undefined {
  switch (relation) {
    case 'verbs with "%w" as object':
    case 'verbs before "%w"':
      return 'verbs-before'
    case 'objects of "%w"':
      return 'objects'
    case 'subjects of "%w"':
      return 'subjects'
    case 'modifiers of "%w"':
      return pos === '-n' ? 'adjectives' : 'adverbs'
    case 'nouns modified by "%w"':
      return 'nouns-after'
    case 'verbs with "%w" as subject':
      return 'verbs-after'
    case 'subjects of "be %w"':
      return 'described'
    case '"%w" and/or ...':
      return 'and-or'
  }
  if (/^verbs with particle "[a-z]+" and "%w" as object$/.test(relation)) return 'phrasal'
  if (PREPOSITIONS.test(relation)) return 'prepositions'
  return undefined
}

const PER_GROUP = 6
const MAX_GROUPS = 7

/** A phrase worth showing: lower case (no names or brands), no numbers or lists, short. */
function cleanPhrase(raw: string): string | undefined {
  const phrase = tidy(raw).replace(/\s+(the|a|an)$/i, '')
  if (!phrase || /\d|,|\|/.test(phrase)) return undefined
  if (/[A-Z]/.test(phrase.replace(/\bI\b/g, ''))) return undefined
  if (phrase.split(' ').length > 6) return undefined
  return phrase
}

export function shapeGroups(raw: RawWord): CollocationGroup[] {
  const groups = new Map<GroupId, { word: string; phrase: string; score: number }[]>()
  for (const rel of raw.rels) {
    const id = groupOf(rel.name, raw.pos)
    if (!id) continue
    const list = groups.get(id) ?? []
    for (const it of rel.items) {
      const phrase = cleanPhrase(it.p)
      if (!phrase || !/^[a-z][a-z'-]*$/.test(it.w)) continue
      list.push({ word: it.w, phrase, score: it.s })
    }
    groups.set(id, list)
  }
  // A phrase or collocate shown in one group is not repeated in a later one
  // ("make informed decisions" under Adjectives, not again under Verbs before).
  const seen = new Set<string>()
  return GROUP_ORDER.filter((id) => groups.get(id)?.length)
    .map((id) => {
      const items = groups
        .get(id)!
        .sort((a, b) => b.score - a.score)
        .filter((x) => {
          const key = x.phrase.toLowerCase()
          if (seen.has(x.word) || seen.has(key)) return false
          seen.add(x.word).add(key)
          return true
        })
        .slice(0, PER_GROUP)
        .map(({ word, phrase }) => ({ word, phrase }))
      return { id, label: LABELS[id], items }
    })
    .filter((g) => g.items.length > 0)
    .slice(0, MAX_GROUPS)
}

/** Good examples first (they arrive sorted), then only clean, readable sentences. */
export function shapeExamples(raw: RawWord['examples'], max = 5): CorpusExample[] {
  const out: CorpusExample[] = []
  const seen = new Set<string>()
  for (const e of raw) {
    const sentence = tidy(`${e.l} ${e.k} ${e.r}`)
    if (sentence.length < 30 || sentence.length > 170) continue
    if (/https?:|www\.|@|©|\||\[|\]|#|:/.test(sentence)) continue
    if (!/^["“'‘(]?[A-Z]/.test(sentence) || !/[.!?]["”’)]?$/.test(sentence)) continue
    const letters = sentence.replace(/[^a-z]/gi, '')
    if (letters.replace(/[^A-Z]/g, '').length / letters.length > 0.2) continue
    const key = sentence.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ before: tidy(e.l), word: e.k, after: tidy(e.r) })
    if (out.length >= max) break
  }
  return out
}

export function shapeSimilar(raw: RawWord['similar'], word: string, max = 10): string[] {
  return raw
    .map((x) => x.w)
    .filter((w) => w !== word && /^[a-z][a-z'-]*$/.test(w))
    .slice(0, max)
}

export function shapeCorpus(raw: RawWord): CorpusData {
  return {
    fetchedAt: new Date().toISOString(),
    pos: raw.pos,
    perMillion: raw.perMillion,
    groups: shapeGroups(raw),
    examples: shapeExamples(raw.examples),
    similar: shapeSimilar(raw.similar, raw.lemma),
  }
}

export interface Comparison {
  a: string
  b: string
  /** used much more with a than with b */
  onlyA: string[]
  onlyB: string[]
  /** typical of both */
  both: string[]
}

/** Typicality (logDice, about 0–14) that makes a collocate count as strong. */
const STRONG = 7
/** How much more typical of one word than the other it must be. */
const APART = 2.5
/** Pairs seen fewer times than this are too rare to teach. */
const MIN_COUNT = 100

/**
 * From a sketch difference: the common collocates that set the two words apart, and
 * those they share. Strong and frequent ones only, most frequent first.
 */
export function shapeComparison(raw: RawDiff, max = 7): Comparison {
  const rows = new Map<string, { a: number; b: number; ca: number; cb: number }>()
  for (const rel of raw.rels)
    for (const r of rel.rows) {
      if (!/^[a-z][a-z'-]*$/.test(r.w) || r.w === raw.a || r.w === raw.b) continue
      const prev = rows.get(r.w)
      if (!prev || r.ca + r.cb > prev.ca + prev.cb) rows.set(r.w, r)
    }
  const list = [...rows].map(([w, r]) => ({ w, ...r }))
  const pick = (keep: (x: (typeof list)[number]) => boolean, count: (x: (typeof list)[number]) => number) =>
    list
      .filter(keep)
      .sort((x, y) => count(y) - count(x))
      .slice(0, max)
      .map((x) => x.w)
  return {
    a: raw.a,
    b: raw.b,
    onlyA: pick((x) => x.a >= STRONG && x.a - x.b >= APART && x.ca >= MIN_COUNT, (x) => x.ca),
    onlyB: pick((x) => x.b >= STRONG && x.b - x.a >= APART && x.cb >= MIN_COUNT, (x) => x.cb),
    both: pick((x) => Math.min(x.a, x.b) >= STRONG - 1 && Math.abs(x.a - x.b) < 1.5 && Math.min(x.ca, x.cb) >= MIN_COUNT, (x) => Math.min(x.ca, x.cb)),
  }
}

/* ---------- fetching (shared per session) ---------- */

export class CorpusUnavailable extends Error {}

async function getFromWorker<T>(path: string): Promise<T> {
  if (!corpusAvailable()) throw new CorpusUnavailable('Rich word data is switched off')
  const res = await fetch(`${SYNC_BASE}${path}`, { signal: AbortSignal.timeout(40_000) })
  if (!res.ok) throw new CorpusUnavailable(`Word data unavailable (${res.status})`)
  return res.json() as Promise<T>
}

/** Bumped when the Worker's answer changes shape, so browsers don't reuse a cached old one. */
const FORMAT = '2'

const words = new Map<string, Promise<CorpusData>>()
const diffs = new Map<string, Promise<Comparison>>()

export function fetchCorpusData(word: string): Promise<CorpusData> {
  let pending = words.get(word)
  if (!pending) {
    pending = getFromWorker<RawWord>(`/v1/word?${new URLSearchParams({ lemma: word, v: FORMAT })}`).then((raw) => {
      const data = shapeCorpus(raw)
      setWordFrequencies([[word, data.perMillion]])
      return data
    })
    pending.catch(() => words.delete(word))
    words.set(word, pending)
  }
  return pending
}

export function fetchComparison(a: string, b: string, pos: string): Promise<Comparison> {
  const key = `${a}~${b}~${pos}`
  let pending = diffs.get(key)
  if (!pending) {
    pending = getFromWorker<RawDiff>(`/v1/compare?${new URLSearchParams({ a, b, pos, v: FORMAT })}`).then((raw) => shapeComparison(raw))
    pending.catch(() => diffs.delete(key))
    diffs.set(key, pending)
  }
  return pending
}
