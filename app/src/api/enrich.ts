import { getEntry, updateEntry } from '../data/db'
import { now, type Enrichment } from '../data/model'
import * as datamuse from './datamuse'
import { lookupWord, type DictionaryResult } from './dictionary'

const settle = <T>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const }))

/**
 * Fetches everything the word page shows, from both APIs in parallel.
 * Free Dictionary is the main source for definitions; Datamuse fills in when it is down.
 * Throws only when nothing at all could be fetched.
 */
export async function fetchEnrichment(word: string): Promise<{ enrichment: Enrichment; frequency?: number }> {
  const [dict, info, coll, rel] = await Promise.all([
    settle(lookupWord(word)),
    settle(datamuse.wordInfo(word)),
    settle(datamuse.collocations(word)),
    settle(datamuse.synonyms(word)),
  ])
  if (!dict.ok && !info.ok) throw new Error('Dictionary services are unreachable')

  const d: DictionaryResult | undefined = dict.ok ? dict.value : undefined
  const meanings = d?.meanings.length ? d.meanings : info.ok ? info.value.meanings : []
  const merge = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])].filter((w) => w !== word)

  return {
    frequency: info.ok ? info.value.frequency : undefined,
    enrichment: {
      fetchedAt: now(),
      definitionsFrom: d?.meanings.length ? 'free-dictionary' : meanings.length ? 'datamuse' : 'none',
      phonetic: d?.phonetic ?? (info.ok ? info.value.ipa : undefined),
      audioUrl: d?.audioUrl,
      origin: d?.origin,
      meanings,
      synonyms: merge(d?.synonyms, rel.ok ? rel.value.synonyms : []).slice(0, 14),
      antonyms: merge(d?.antonyms, rel.ok ? rel.value.antonyms : []).slice(0, 8),
      collocations: coll.ok ? coll.value : { before: [], after: [], adjectives: [], nouns: [] },
    },
  }
}

const inFlight = new Map<string, Promise<void>>()

/** Fetches dictionary data and copies it into the entry. Concurrent calls for the same entry share one request. */
export function enrichEntry(id: string): Promise<void> {
  let pending = inFlight.get(id)
  if (!pending) {
    pending = (async () => {
      const entry = await getEntry(id)
      if (!entry) return
      const { enrichment, frequency } = await fetchEnrichment(entry.word)
      await updateEntry(id, (e) => ({ ...e, enrichment, frequency: frequency ?? e.frequency }))
    })().finally(() => inFlight.delete(id))
    inFlight.set(id, pending)
  }
  return pending
}

export function isEnriching(id: string): boolean {
  return inFlight.has(id)
}
