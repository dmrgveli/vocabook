import { cacheEnrichment, getEntry, listEntries, subscribe } from '../data/db'
import { ENRICHMENT_VERSION, now, type Enrichment } from '../data/model'
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
      collocations: coll.ok ? coll.value : { before: [], after: [] },
      version: ENRICHMENT_VERSION,
    },
  }
}

/** Look-ups of words not in the notebook, kept for the session (and reused if the word is then added). */
const lookups = new Map<string, ReturnType<typeof fetchEnrichment>>()

export function lookUp(word: string): ReturnType<typeof fetchEnrichment> {
  let pending = lookups.get(word)
  if (!pending) {
    pending = fetchEnrichment(word)
    pending.catch(() => lookups.delete(word))
    lookups.set(word, pending)
  }
  return pending
}

const inFlight = new Map<string, Promise<void>>()

/** Fetches dictionary data and copies it into the entry. Concurrent calls for the same entry share one request. */
export function enrichEntry(id: string): Promise<void> {
  let pending = inFlight.get(id)
  if (!pending) {
    pending = (async () => {
      const entry = await getEntry(id)
      if (!entry) return
      const { enrichment, frequency } = await (lookups.get(entry.word) ?? fetchEnrichment(entry.word))
      lookups.delete(entry.word)
      await cacheEnrichment(id, enrichment, frequency)
    })().finally(() => inFlight.delete(id))
    inFlight.set(id, pending)
  }
  return pending
}

export function isEnriching(id: string): boolean {
  return inFlight.has(id)
}

/* ---------- background fill-in ---------- */

// Dictionary data is not synced (see sync/merge.ts), so words that arrive from another
// device have none here. This fills them in quietly, a couple at a time, so the notebook
// cards show a definition without the word page being opened first. No cloud space used.

const BACKFILL_CONCURRENCY = 2
const BACKFILL_PAUSE_MS = 400
/** Words that failed this session (e.g. offline) wait for a reload or a reconnect. */
const failed = new Set<string>()
let backfilling = false
let pending = false

async function backfill() {
  if (backfilling) {
    pending = true
    return
  }
  backfilling = true
  try {
    do {
      pending = false
      if (!navigator.onLine) return
      const missing = (await listEntries()).filter((e) => !e.enrichment && !failed.has(e.id) && !inFlight.has(e.id))
      const queue = [...missing]
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await enrichEntry(next.id).catch(() => failed.add(next.id))
          await new Promise((r) => setTimeout(r, BACKFILL_PAUSE_MS))
        }
      }
      await Promise.all(Array.from({ length: BACKFILL_CONCURRENCY }, worker))
    } while (pending)
  } finally {
    backfilling = false
  }
}

let started = false

/** Fills in missing dictionary data on start-up and whenever synced words arrive. */
export function startBackfill() {
  if (started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (delay: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void backfill(), delay)
  }
  subscribe((origin) => origin === 'sync' && schedule(1000))
  window.addEventListener('online', () => {
    failed.clear()
    schedule(1000)
  })
  schedule(3000)
}
