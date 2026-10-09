// Word data from Sketch Engine (word sketches, good dictionary examples, thesaurus,
// sketch differences), fetched by the Worker so the API key never reaches a browser.
//
// Every result is stored in R2 and shared by all users: a word costs Sketch Engine
// requests only the first time anyone opens it. A daily budget keeps the account well
// inside Sketch Engine's fair use limits (100/min, 900/h, 2,000/day); past it the app
// falls back to its older word data until the next day.

export interface SketchEnv {
  BUCKET: R2Bucket
  SKETCH_ENGINE_KEY?: string
}

const API = 'https://api.sketchengine.eu/search'
export const CORPUS = 'preloaded/ententen21_tt31'
/** Cache layout version: bump to refetch everything after changing what is stored. */
const CACHE = 'cache/ske/v1'
export const DAILY_BUDGET = 1500
const TIMEOUT_MS = 25_000
/** Collocates kept per grammatical relation (the app shows fewer). */
const PER_RELATION = 10

/** Relations that say little to a learner: pronouns, wh-words, usage statistics. */
const SKIP_RELATIONS = [/^pronominal /, /^wh-words/, /^usage patterns/, /^prepositional phrases$/]

export class SketchError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}

export interface SketchRelation {
  name: string
  items: { w: string; p: string; s: number }[]
}

export interface SketchExample {
  l: string
  k: string
  r: string
}

export interface SketchWord {
  v: 1
  corpus: 'ententen21'
  lemma: string
  /** part of speech Sketch Engine used: -n, -v, -j, -a… */
  pos: string
  /** occurrences per million words */
  perMillion?: number
  rels: SketchRelation[]
  examples: SketchExample[]
  similar: { w: string; s: number }[]
}

export interface SketchDiff {
  v: 1
  a: string
  b: string
  pos: string
  /** a, b: typicality score (logDice) with each word; ca, cb: how often they occur together */
  rels: { name: string; rows: { w: string; a: number; b: number; ca: number; cb: number }[] }[]
}

const LEMMA = /^[a-z][a-z'-]*( [a-z][a-z'-]*){0,4}$/
const POS = /^-[nvjarcdim]$/

export function validLemma(raw: string | null): string | undefined {
  const lemma = raw?.trim().toLowerCase().replace(/\s+/g, ' ')
  return lemma && lemma.length <= 60 && LEMMA.test(lemma) ? lemma : undefined
}

export const validPos = (raw: string | null) => (raw && POS.test(raw) ? raw : '')

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

async function ske<T>(env: SketchEnv, method: string, params: Record<string, string>, fetcher: Fetcher): Promise<T> {
  if (!env.SKETCH_ENGINE_KEY) throw new SketchError('Word data is not configured', 503)
  const url = `${API}/${method}?${new URLSearchParams({ corpname: CORPUS, format: 'json', ...params })}`
  const res = await fetcher(url, {
    headers: { Authorization: `Bearer ${env.SKETCH_ENGINE_KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 429) throw new SketchError('Word data is busy, try again later', 503)
  const text = await res.text()
  if (!res.ok || !text.startsWith('{')) throw new SketchError(`Sketch Engine ${method}: ${res.status} ${text.slice(0, 80)}`)
  const body = JSON.parse(text) as T & { error?: string }
  if (body.error) throw new SketchError(`Sketch Engine ${method}: ${body.error}`)
  return body
}

/* ---------- shaping Sketch Engine's answers into what we store ---------- */

interface WsketchItem {
  word?: string
  cm?: string
  score?: number
  gramrel?: string
}

export function shapeRelations(items: WsketchItem[]): SketchRelation[] {
  const byName = new Map<string, SketchRelation>()
  for (const it of items) {
    const name = it.gramrel
    if (!name || !it.word || it.word === 'None' || SKIP_RELATIONS.some((r) => r.test(name))) continue
    const rel = byName.get(name) ?? { name, items: [] }
    if (rel.items.length < PER_RELATION) rel.items.push({ w: it.word, p: it.cm ?? '', s: it.score ?? 0 })
    byName.set(name, rel)
  }
  return [...byName.values()]
}

interface Token {
  str?: string
}
interface ConcLine {
  Left?: Token[]
  Kwic?: Token[]
  Right?: Token[]
}

const joinTokens = (tokens: Token[] = []) =>
  tokens
    .map((t) => t.str?.trim())
    .filter(Boolean)
    .join(' ')

export function shapeExamples(lines: ConcLine[]): SketchExample[] {
  return lines.map((l) => ({ l: joinTokens(l.Left), k: joinTokens(l.Kwic), r: joinTokens(l.Right) })).filter((e) => e.k)
}

interface DiffRow {
  word?: string
  rnk1?: number
  rnk2?: number
  cnt1?: number
  cnt2?: number
}
interface DiffBlock {
  table?: { Rows?: DiffRow[]; Header?: unknown[] }
}

export function shapeDiff(content: Record<string, DiffBlock[] | undefined>): SketchDiff['rels'] {
  const rels: SketchDiff['rels'] = []
  for (const part of ['common', 'lemma1_only', 'lemma2_only']) {
    for (const block of content[part] ?? []) {
      const name = String(block.table?.Header?.[0] ?? '')
      if (!name || SKIP_RELATIONS.some((r) => r.test(name))) continue
      const rows = (block.table?.Rows ?? [])
        .filter((r) => r.word)
        .map((r) => ({ w: r.word!, a: r.rnk1 ?? 0, b: r.rnk2 ?? 0, ca: r.cnt1 ?? 0, cb: r.cnt2 ?? 0 }))
      if (rows.length) rels.push({ name, rows })
    }
  }
  return rels
}

/* ---------- fetching ---------- */

async function fetchWord(env: SketchEnv, lemma: string, pos: string, fetcher: Fetcher): Promise<SketchWord> {
  const phrase = lemma.includes(' ')
  const lpos: Record<string, string> = pos ? { lpos: pos } : {}
  const concordance = JSON.stringify({
    concordance_query: [
      phrase ? { queryselector: 'phraserow', phrase: lemma } : { queryselector: 'lemmarow', lemma, ...lpos },
      { q: 'e100' }, // GDEX: the 100 best "dictionary example" sentences first
    ],
  })
  const [ws, conc, thes] = await Promise.allSettled([
    phrase
      ? Promise.resolve(undefined)
      : ske<{ Items?: WsketchItem[]; lpos?: string; relfreq?: number }>(
          env,
          'wsketch',
          { lemma, ...lpos, maxitems: String(PER_RELATION), structured: '0' },
          fetcher,
        ),
    ske<{ Lines?: ConcLine[] }>(env, 'concordance', { json: concordance, viewmode: 'sen', pagesize: '12', asyn: '0' }, fetcher),
    phrase ? Promise.resolve(undefined) : ske<{ Words?: { word: string; score: number }[] }>(env, 'thes', { lemma, ...lpos, maxthesitems: '15' }, fetcher),
  ])
  if (ws.status === 'rejected' && conc.status === 'rejected') throw ws.reason
  const sketch = ws.status === 'fulfilled' ? ws.value : undefined
  return {
    v: 1,
    corpus: 'ententen21',
    lemma,
    pos: sketch?.lpos ?? pos,
    perMillion: sketch?.relfreq,
    rels: shapeRelations(sketch?.Items ?? []),
    examples: conc.status === 'fulfilled' ? shapeExamples(conc.value.Lines ?? []) : [],
    similar: thes.status === 'fulfilled' ? (thes.value?.Words ?? []).map((x) => ({ w: x.word, s: x.score })) : [],
  }
}

async function fetchDiff(env: SketchEnv, a: string, b: string, pos: string, fetcher: Fetcher): Promise<SketchDiff> {
  const body = await ske<{ content?: Record<string, DiffBlock[]>; lpos?: string }>(
    env,
    'wsdiff',
    { lemma: a, lemma2: b, ...(pos ? { lpos: pos } : ({} as Record<string, string>)), diff_by: 'lemma', maxcommon: '12', maxexclusive: '8' },
    fetcher,
  )
  return { v: 1, a, b, pos: body.lpos ?? pos, rels: shapeDiff(body.content ?? {}) }
}

/* ---------- cache and budget ---------- */

const today = () => new Date().toISOString().slice(0, 10)

/** Reserves Sketch Engine requests from today's budget. Approximate (R2 is not atomic), which is fine for a safety margin. */
async function reserve(env: SketchEnv, requests: number): Promise<void> {
  const key = `${CACHE}/budget/${today()}.json`
  const used = ((await (await env.BUCKET.get(key))?.json()) as { n?: number } | null)?.n ?? 0
  if (used + requests > DAILY_BUDGET) throw new SketchError('Word data is resting for today', 503)
  await env.BUCKET.put(key, JSON.stringify({ n: used + requests }))
}

async function cached<T>(env: SketchEnv, key: string, requests: number, load: () => Promise<T>): Promise<T> {
  const hit = await env.BUCKET.get(key)
  if (hit) return (await hit.json()) as T
  if (!env.SKETCH_ENGINE_KEY) throw new SketchError('Word data is not configured', 503)
  await reserve(env, requests)
  const value = await load()
  await env.BUCKET.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } })
  return value
}

const safeKey = (s: string) => encodeURIComponent(s)

export function getWord(env: SketchEnv, lemma: string, pos: string, fetcher: Fetcher = fetch): Promise<SketchWord> {
  return cached(env, `${CACHE}/word/${pos || 'any'}/${safeKey(lemma)}.json`, lemma.includes(' ') ? 1 : 3, () =>
    fetchWord(env, lemma, pos, fetcher),
  )
}

export function getDiff(env: SketchEnv, a: string, b: string, pos: string, fetcher: Fetcher = fetch): Promise<SketchDiff> {
  return cached(env, `${CACHE}/diff2/${pos || 'any'}/${safeKey(a)}~${safeKey(b)}.json`, 1, () => fetchDiff(env, a, b, pos, fetcher))
}
