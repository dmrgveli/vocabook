import type { Meaning } from '../data/model'
import { getJson, NotFoundError } from './http'

// Free Dictionary API: a free, volunteer-run service. It can be slow or down,
// so every caller must cope with a failure.
const BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

interface FDDefinition {
  definition: string
  example?: string
  synonyms?: string[]
  antonyms?: string[]
}

export interface FDEntry {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  origin?: string
  meanings: { partOfSpeech: string; definitions: FDDefinition[]; synonyms?: string[]; antonyms?: string[] }[]
}

export interface DictionaryResult {
  phonetic?: string
  audioUrl?: string
  origin?: string
  meanings: Meaning[]
  synonyms: string[]
  antonyms: string[]
}

const unique = (list: string[]) => [...new Set(list)]

/** Merges the API's entries (one per etymology) into a single result. */
export function parseDictionary(entries: FDEntry[]): DictionaryResult {
  const phonetics = entries.flatMap((e) => e.phonetics ?? [])
  // Prefer US audio, then any audio.
  const audio = phonetics.find((p) => p.audio?.includes('-us.')) ?? phonetics.find((p) => p.audio)
  const byPos = new Map<string, Meaning>()
  const synonyms: string[] = []
  const antonyms: string[] = []

  for (const m of entries.flatMap((e) => e.meanings)) {
    const meaning = byPos.get(m.partOfSpeech) ?? { partOfSpeech: m.partOfSpeech, definitions: [] }
    for (const d of m.definitions) {
      meaning.definitions.push({ definition: d.definition, example: d.example })
      synonyms.push(...(d.synonyms ?? []))
      antonyms.push(...(d.antonyms ?? []))
    }
    synonyms.push(...(m.synonyms ?? []))
    antonyms.push(...(m.antonyms ?? []))
    byPos.set(m.partOfSpeech, meaning)
  }

  return {
    phonetic: entries.find((e) => e.phonetic)?.phonetic ?? phonetics.find((p) => p.text)?.text,
    audioUrl: audio?.audio || undefined,
    origin: entries.find((e) => e.origin)?.origin,
    meanings: [...byPos.values()],
    synonyms: unique(synonyms),
    antonyms: unique(antonyms),
  }
}

/** undefined = the dictionary has no entry for this word. Throws when the service is unreachable. */
export async function lookupWord(word: string): Promise<DictionaryResult | undefined> {
  try {
    return parseDictionary(await getJson<FDEntry[]>(`${BASE}/${encodeURIComponent(word)}`, { timeoutMs: 15_000 }))
  } catch (err) {
    if (err instanceof NotFoundError) return undefined
    throw err
  }
}
