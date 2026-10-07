import type { Meaning } from '../data/model'
import { getJson } from './http'

// Datamuse: autocomplete, frequency, collocations, synonyms and backup definitions.
// From 1 January 2027 an API key is required; then these calls move behind the Worker
// (only BASE changes).
const BASE = 'https://api.datamuse.com'

interface DatamuseWord {
  word: string
  score?: number
  tags?: string[]
  defs?: string[]
}

export interface Suggestion {
  word: string
  frequency?: number
}

function tag(w: DatamuseWord, prefix: string): string | undefined {
  return w.tags?.find((t) => t.startsWith(prefix))?.slice(prefix.length)
}

export function parseFrequency(w: DatamuseWord): number | undefined {
  const f = tag(w, 'f:')
  return f === undefined ? undefined : Number(f)
}

const isWord = (w: string) => /^[a-z][a-z' -]*$/i.test(w)

const cache = new Map<string, Promise<Suggestion[]>>()

/** Words starting with the prefix, with frequency. The exact match, if any, comes first. */
export function suggest(prefix: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const q = prefix.trim().toLowerCase()
  if (!q) return Promise.resolve([])
  let pending = cache.get(q)
  if (!pending) {
    pending = getJson<DatamuseWord[]>(`${BASE}/words?sp=${encodeURIComponent(q)}*&md=f&max=10`, { signal })
      .then((words) => {
        const list = words
          .filter((w) => isWord(w.word))
          .map((w) => ({ word: w.word.toLowerCase(), frequency: parseFrequency(w) }))
        const exact = list.findIndex((s) => s.word === q)
        if (exact > 0) list.unshift(...list.splice(exact, 1))
        return list.slice(0, 7)
      })
      .catch((err) => {
        cache.delete(q)
        throw err
      })
    cache.set(q, pending)
  }
  return pending
}

const POS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: 'other' }

/** Datamuse definitions look like "v\t(intransitive) To grow vigorously." */
export function parseDefinitions(defs: string[] = []): Meaning[] {
  const byPos = new Map<string, Meaning>()
  for (const raw of defs) {
    const [pos, ...rest] = raw.split('\t')
    const definition = rest.join('\t').trim()
    if (!definition) continue
    const partOfSpeech = POS[pos] ?? pos
    const meaning = byPos.get(partOfSpeech) ?? { partOfSpeech, definitions: [] }
    meaning.definitions.push({ definition })
    byPos.set(partOfSpeech, meaning)
  }
  return [...byPos.values()]
}

export interface WordInfo {
  frequency?: number
  ipa?: string
  meanings: Meaning[]
}

export async function wordInfo(word: string): Promise<WordInfo> {
  const [w] = await getJson<DatamuseWord[]>(`${BASE}/words?sp=${encodeURIComponent(word)}&md=dfr&ipa=1&max=1`)
  if (!w || w.word.toLowerCase() !== word) return { meanings: [] }
  const ipa = tag(w, 'ipa_pron:')
  return { frequency: parseFrequency(w), ipa: ipa ? `/${ipa.trim()}/` : undefined, meanings: parseDefinitions(w.defs) }
}

async function related(rel: string, word: string, keep: (w: string) => boolean, max: number): Promise<string[]> {
  const words = await getJson<DatamuseWord[]>(`${BASE}/words?${rel}=${encodeURIComponent(word)}&max=60`)
  return words
    .map((w) => w.word.toLowerCase())
    .filter((w) => isWord(w) && w !== word && keep(w))
    .slice(0, max)
}

// Words that are frequent next to almost anything and say nothing about this word
// ("the decision", "will thrive", "thrive and"). Prepositions are listed separately:
// after a word they often form a real pattern ("thrive on", "rely on"), before it they rarely do.
const FUNCTION_WORDS = new Set(
  (
    'a an the this that these those my your his her its our their me him us them i you he she it we they ' +
    'who whom whose which what where when why how there here and or but nor so yet if then than because while ' +
    'although though unless whether as is am are was were be been being do does did done have has had having ' +
    'will would shall should can could may might must ought not no never only also even still just very too ' +
    'more most much many some any all each every both either neither such other another own same one ones ' +
    'quite rather really actually often always already again ever now out up s t'
  ).split(' '),
)
const PREPOSITIONS = new Set(
  (
    'in on at by for with without within from to of about above across after against along among around ' +
    'before behind below beneath beside between beyond despite during except inside into like near off onto ' +
    'outside over past since through throughout toward towards under underneath until upon via'
  ).split(' '),
)

const meaningful = (w: string) => !FUNCTION_WORDS.has(w) && !PREPOSITIONS.has(w) && w.length > 1

/** After the word, keep content words and the few most frequent prepositions ("thrive on", "decision about"). */
function keepFollower(maxPrepositions = 4) {
  let prepositions = 0
  return (w: string) => meaningful(w) || (PREPOSITIONS.has(w) && w !== 'of' && ++prepositions <= maxPrepositions)
}

export interface Collocations {
  /** "plants thrive" */
  before: string[]
  /** "thrive on", "decision making" */
  after: string[]
  /** Adjectives often used with this noun: "final decision" */
  adjectives: string[]
  /** Nouns this adjective often describes: "meticulous care" */
  nouns: string[]
}

async function partsOfSpeech(word: string): Promise<string[]> {
  const [w] = await getJson<DatamuseWord[]>(`${BASE}/words?sp=${encodeURIComponent(word)}&md=p&max=1`)
  return w?.word.toLowerCase() === word ? (w.tags ?? []) : []
}

export async function collocations(word: string): Promise<Collocations> {
  // Adjective/noun pairs only make sense for nouns and adjectives; for other words
  // Datamuse returns fragments of idioms ("failure to thrive" → "thrive children").
  const pos = await partsOfSpeech(word).catch((): string[] => [])
  const none = Promise.resolve<string[]>([])
  const [before, after, adjectives, nouns] = await Promise.all([
    related('rel_bgb', word, meaningful, 10),
    related('rel_bga', word, keepFollower(), 10),
    pos.includes('n') ? related('rel_jjb', word, meaningful, 12) : none,
    pos.includes('adj') ? related('rel_jja', word, meaningful, 12) : none,
  ])
  // A pair already shown as "adjective + noun" doesn't need repeating as a plain neighbour.
  const shown = new Set(adjectives)
  return { before: before.filter((w) => !shown.has(w)), after, adjectives, nouns }
}

export async function synonyms(word: string): Promise<{ synonyms: string[]; antonyms: string[] }> {
  const [syn, ant] = await Promise.all([
    related('rel_syn', word, () => true, 12),
    related('rel_ant', word, () => true, 8),
  ])
  return { synonyms: syn, antonyms: ant }
}
