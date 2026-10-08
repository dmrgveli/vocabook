import { cacheEnrichment, getEntry, listEntries, patchEnrichment, subscribe } from '../data/db'
import { ENRICHMENT_VERSION, now, type Enrichment } from '../data/model'
import * as datamuse from './datamuse'
import { lookupWord, type DictionaryResult } from './dictionary'

type Settled<T> = { ok: true; value: T } | { ok: false }
const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const }))

export interface EnrichmentResult {
  enrichment: Enrichment
  frequency?: number
}

export interface EnrichmentFetch {
  /** Ready as soon as one source has definitions (or both have answered). */
  first: Promise<EnrichmentResult>
  /**
   * What Free Dictionary adds when it answers after the definitions were already taken
   * from Datamuse: a recording, the origin, IPA. Never changes the definitions, so the
   * page does not reshuffle under the reader. Undefined when there is nothing to add.
   */
  late: Promise<Partial<Enrichment> | undefined>
}

/**
 * Fetches everything the word page shows. Both dictionaries are asked at once and the
 * first one with definitions wins (Datamuse usually answers in well under a second,
 * Free Dictionary can take ten). `first` rejects only when nothing at all could be fetched.
 */
export function fetchEnrichment(word: string): EnrichmentFetch {
  let dictDone: Settled<DictionaryResult | undefined> | undefined
  const dictP = settle(lookupWord(word)).then((d) => (dictDone = d))
  const infoP = settle(datamuse.wordInfo(word))
  const collP = settle(datamuse.collocations(word))
  const relP = settle(datamuse.synonyms(word))

  const winner = new Promise<Enrichment['definitionsFrom']>((resolve) => {
    let waiting = 2
    const settled = (from: 'free-dictionary' | 'datamuse', hasMeanings: boolean) =>
      hasMeanings ? resolve(from) : --waiting === 0 && resolve('none')
    void dictP.then((d) => settled('free-dictionary', Boolean(d.ok && d.value?.meanings.length)))
    void infoP.then((i) => settled('datamuse', Boolean(i.ok && i.value.meanings.length)))
  })

  const first = (async (): Promise<EnrichmentResult> => {
    const from = await winner
    const [info, coll, rel] = await Promise.all([infoP, collP, relP])
    if (from === 'free-dictionary') await dictP
    // Free Dictionary may have answered by now even if it lost; its extras are welcome.
    const d = dictDone?.ok ? dictDone.value : undefined
    if (from === 'none' && !dictDone?.ok && !info.ok) throw new Error('Dictionary services are unreachable')

    const meanings = from === 'free-dictionary' ? d!.meanings : from === 'datamuse' && info.ok ? info.value.meanings : []
    const merge = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])].filter((w) => w !== word)
    return {
      frequency: info.ok ? info.value.frequency : undefined,
      enrichment: {
        fetchedAt: now(),
        definitionsFrom: from,
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
  })()

  const late = first
    .then(async ({ enrichment }) => {
      if (dictDone) return undefined // already part of `first`
      const d = await dictP
      if (!d.ok || !d.value) return undefined
      const patch: Partial<Enrichment> = {}
      if (d.value.audioUrl) patch.audioUrl = d.value.audioUrl
      if (d.value.origin) patch.origin = d.value.origin
      if (!enrichment.phonetic && d.value.phonetic) patch.phonetic = d.value.phonetic
      return Object.keys(patch).length ? patch : undefined
    })
    .catch(() => undefined)

  return { first, late }
}

/** Look-ups of words not in the notebook, kept for the session (and reused if the word is then added). */
const lookups = new Map<string, EnrichmentFetch>()

export function lookUp(word: string): EnrichmentFetch {
  let pending = lookups.get(word)
  if (!pending) {
    pending = fetchEnrichment(word)
    pending.first.catch(() => lookups.delete(word))
    lookups.set(word, pending)
  }
  return pending
}

const inFlight = new Map<string, Promise<void>>()

/**
 * Fetches dictionary data and copies it into the entry; resolves once the definitions
 * are stored. Late extras are added afterwards. Concurrent calls share one request.
 */
export function enrichEntry(id: string): Promise<void> {
  let pending = inFlight.get(id)
  if (!pending) {
    pending = (async () => {
      const entry = await getEntry(id)
      if (!entry) return
      const fetch = lookups.get(entry.word) ?? fetchEnrichment(entry.word)
      lookups.delete(entry.word)
      const { enrichment, frequency } = await fetch.first
      await cacheEnrichment(id, enrichment, frequency)
      void fetch.late.then((patch) => patch && patchEnrichment(id, patch))
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
