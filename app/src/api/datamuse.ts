import type { Collocation, Meaning } from '../data/model'
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
  /** Set when the definitions belong to the base form ("prospered" → "prosper"). */
  defHeadword?: string
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

export interface Peek {
  /** Base form shown and added to the notebook ("prosper"). */
  word: string
  /** The form that was clicked, when it differs ("prospered"). */
  form?: string
  frequency?: number
  ipa?: string
  partOfSpeech?: string
  definition?: string
}

const peekCache = new Map<string, Promise<Peek>>()

/** A short look-up for the word pop-up: base form, frequency, IPA and one definition. */
export function peek(clicked: string): Promise<Peek> {
  const form = clicked.trim().toLowerCase()
  let pending = peekCache.get(form)
  if (!pending) {
    pending = (async () => {
      const [w] = await getJson<DatamuseWord[]>(`${BASE}/words?sp=${encodeURIComponent(form)}&md=dfr&ipa=1&max=1`)
      const head = w?.defHeadword?.toLowerCase()
      const base = head && head !== form ? await wordInfo(head) : undefined
      const own: WordInfo = w && w.word.toLowerCase() === form
        ? { frequency: parseFrequency(w), ipa: tag(w, 'ipa_pron:') ? `/${tag(w, 'ipa_pron:')!.trim()}/` : undefined, meanings: parseDefinitions(w.defs) }
        : { meanings: [] }
      const info = base ?? own
      const meaning = info.meanings[0] ?? own.meanings[0]
      return {
        word: base ? head! : form,
        form: base ? form : undefined,
        frequency: info.frequency,
        ipa: info.ipa,
        partOfSpeech: meaning?.partOfSpeech,
        definition: meaning?.definitions[0]?.definition,
      }
    })().catch((err) => {
      peekCache.delete(form)
      throw err
    })
    peekCache.set(form, pending)
  }
  return pending
}

async function related(rel: string, word: string, keep: (w: string) => boolean, max: number): Promise<Collocation[]> {
  const words = await getJson<DatamuseWord[]>(`${BASE}/words?${rel}=${encodeURIComponent(word)}&max=60`)
  return words
    .map((w) => ({ word: w.word.toLowerCase(), score: w.score }))
    .filter((c) => isWord(c.word) && c.word !== word && keep(c.word))
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

/** Words not worth looking up on their own ("the", "of", "would"). */
export const isFunctionWord = (w: string) => FUNCTION_WORDS.has(w) || PREPOSITIONS.has(w)

/** After the word, keep content words and the few most frequent prepositions ("thrive on", "decision about"). */
function keepFollower(maxPrepositions = 4) {
  let prepositions = 0
  return (w: string) => meaningful(w) || (PREPOSITIONS.has(w) && w !== 'of' && ++prepositions <= maxPrepositions)
}

// For the bigram relations Datamuse's score tracks how often the pair occurs
// (rely on ≈ 643k, rely upon ≈ 125k), so it works as a relative frequency.
// Results arrive sorted by it, most frequent first.

export interface Collocations {
  /** "plants thrive": the word comes after these */
  before: Collocation[]
  /** "thrive on": the word comes before these */
  after: Collocation[]
}

export async function collocations(word: string): Promise<Collocations> {
  const [before, after] = await Promise.all([
    related('rel_bgb', word, meaningful, 8),
    related('rel_bga', word, keepFollower(), 8),
  ])
  return { before, after }
}

export async function synonyms(word: string): Promise<{ synonyms: string[]; antonyms: string[] }> {
  const [syn, ant] = await Promise.all([
    related('rel_syn', word, () => true, 8),
    related('rel_ant', word, () => true, 6),
  ])
  return { synonyms: syn.map((c) => c.word), antonyms: ant.map((c) => c.word) }
}
