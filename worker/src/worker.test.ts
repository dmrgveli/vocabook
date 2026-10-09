import { beforeAll, describe, expect, it } from 'vitest'
import { verifyGoogleIdToken } from './google'
import { handle, type Env } from './index'
import { validateNotebook } from './schema'
import { issueSession, verifySession } from './session'
import { DAILY_BUDGET, shapeDiff, shapeExamples, shapeRelations } from './sketch'

const CLIENT_ID = 'test-client.apps.googleusercontent.com'
const SECRET = 'test-session-secret-0123456789abcdef'
const ORIGIN = 'https://dmrgveli.github.io'

let privateKey: CryptoKey
let publicJwk: JsonWebKey & { kid: string }
const fetchKeys = async () => [publicJwk]

const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(claims: Record<string, unknown>, kid = 'k1') {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`))
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
}

const now = () => Math.floor(Date.now() / 1000)
const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  exp: now() + 600,
  iat: now(),
  ...over,
})

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  privateKey = pair.privateKey
  publicJwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid: 'k1' }
})

describe('verifyGoogleIdToken', () => {
  it('accepts a valid token', async () => {
    const user = await verifyGoogleIdToken(await sign(goodClaims()), CLIENT_ID, { fetchKeys })
    expect(user.sub).toBe('1234567890')
  })

  it.each([
    ['wrong audience', { aud: 'someone-else' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired', { exp: now() - 3600 }],
    ['non-numeric subject', { sub: '../other-user' }],
  ])('rejects %s', async (_, over) => {
    await expect(verifyGoogleIdToken(await sign(goodClaims(over)), CLIENT_ID, { fetchKeys })).rejects.toThrow()
  })

  it('rejects a tampered payload and unknown keys', async () => {
    const token = await sign(goodClaims())
    const [h, , s] = token.split('.')
    const forged = `${h}.${b64url(JSON.stringify(goodClaims({ sub: '999' })))}.${s}`
    await expect(verifyGoogleIdToken(forged, CLIENT_ID, { fetchKeys })).rejects.toThrow('Bad signature')
    await expect(verifyGoogleIdToken(await sign(goodClaims(), 'other'), CLIENT_ID, { fetchKeys })).rejects.toThrow('Unknown signing key')
  })
})

describe('validateNotebook', () => {
  const entry = {
    id: 'a',
    createdAt: '2026-10-07T10:00:00Z',
    updatedAt: '2026-10-07T10:00:00Z',
    word: 'thrive',
    mastery: 'recognize',
    encounters: [{ id: 'e', createdAt: 'x', updatedAt: 'x', source: 'Show', date: '2026-10-07' }],
    notes: [],
    tags: ['work'],
  }
  it('accepts what the app writes', () => {
    expect(() => validateNotebook({ version: 1, entries: [entry] })).not.toThrow()
  })
  it('rejects bad shapes and synced dictionary data', () => {
    expect(() => validateNotebook({ version: 2, entries: [] })).toThrow()
    expect(() => validateNotebook({ version: 1, entries: [{ ...entry, mastery: 'master' }] })).toThrow()
    expect(() => validateNotebook({ version: 1, entries: [{ ...entry, enrichment: {} }] })).toThrow()
    expect(() => validateNotebook({ version: 1, entries: [{ ...entry, tags: [1] }] })).toThrow()
  })
})

/** In-memory stand-in for the parts of R2 the Worker uses. */
function fakeBucket() {
  const store = new Map<string, { text: string; etag: string }>()
  let n = 0
  const obj = (key: string) => {
    const o = store.get(key)!
    return { etag: o.etag, json: async () => JSON.parse(o.text) }
  }
  return {
    store,
    async get(key: string) {
      return store.has(key) ? obj(key) : null
    },
    async head(key: string) {
      return store.has(key) ? obj(key) : null
    },
    async put(key: string, text: string, opts?: { onlyIf?: { etagMatches?: string } }) {
      const match = opts?.onlyIf?.etagMatches
      if (match !== undefined && store.get(key)?.etag !== match) return null
      store.set(key, { text, etag: `etag-${++n}` })
      return obj(key)
    },
    async delete(key: string) {
      store.delete(key)
    },
  }
}

describe('sync API', () => {
  const notebook = { version: 1, entries: [] }
  let bucket: ReturnType<typeof fakeBucket>
  let env: Env

  const call = async (
    method: string,
    init: { token?: string; body?: unknown; headers?: Record<string, string>; path?: string } = {},
  ) => {
    const headers: Record<string, string> = { origin: ORIGIN, ...init.headers }
    if (init.token) headers.authorization = `Bearer ${init.token}`
    const req = new Request(`https://sync.example${init.path ?? '/v1/notebook'}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    return handle(req, env, fetchKeys)
  }

  beforeAll(() => {
    bucket = fakeBucket()
    env = { BUCKET: bucket as unknown as R2Bucket, GOOGLE_CLIENT_ID: CLIENT_ID, SESSION_SECRET: SECRET, ALLOWED_ORIGINS: ORIGIN }
  })

  it('requires a valid token', async () => {
    expect((await call('GET')).status).toBe(401)
    expect((await call('GET', { token: 'nope' })).status).toBe(401)
  })

  it('only sends CORS headers to the allowed origin', async () => {
    const ok = await handle(new Request('https://sync.example/v1/notebook', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const bad = await handle(new Request('https://sync.example/v1/notebook', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env)
    expect(bad.status).toBe(403)
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('creates, reads and conditionally updates the notebook under users/<sub>/', async () => {
    const token = await sign(goodClaims())
    expect(await (await call('GET', { token })).json()).toEqual({ etag: null, notebook: null })

    expect((await call('PUT', { token, body: notebook })).status).toBe(428)
    const created = await call('PUT', { token, body: notebook, headers: { 'if-none-match': '*' } })
    const { etag } = (await created.json()) as { etag: string }
    expect([...bucket.store.keys()]).toEqual(['users/1234567890/progress.json'])

    expect((await call('PUT', { token, body: notebook, headers: { 'if-none-match': '*' } })).status).toBe(412)
    expect((await call('PUT', { token, body: notebook, headers: { 'if-match': 'stale' } })).status).toBe(412)
    expect((await call('PUT', { token, body: notebook, headers: { 'if-match': `"${etag}"` } })).status).toBe(200)

    const read = (await (await call('GET', { token })).json()) as { notebook: unknown }
    expect(read.notebook).toEqual(notebook)
  })

  it('rejects invalid and oversized bodies', async () => {
    const token = await sign(goodClaims({ sub: '42' }))
    expect((await call('PUT', { token, body: { version: 1 }, headers: { 'if-none-match': '*' } })).status).toBe(400)
    const huge = { version: 1, entries: [], pad: 'x'.repeat(2 * 1024 * 1024) }
    expect((await call('PUT', { token, body: huge, headers: { 'if-none-match': '*' } })).status).toBe(413)
  })

  it('deletes only the caller’s copy', async () => {
    const other = await sign(goodClaims({ sub: '777' }))
    await call('PUT', { token: other, body: notebook, headers: { 'if-none-match': '*' } })
    await call('DELETE', { token: other })
    expect(bucket.store.has('users/777/progress.json')).toBe(false)
    expect(bucket.store.has('users/1234567890/progress.json')).toBe(true)
  })

  it('trades a Google token for a session that works on its own and can be renewed', async () => {
    expect((await call('POST', { path: '/v1/session' })).status).toBe(401)
    const google = await sign(goodClaims({ sub: '555' }))
    const res = await call('POST', { token: google, path: '/v1/session' })
    const { token, expires } = (await res.json()) as { token: string; expires: number }
    expect(token.startsWith('vs1.')).toBe(true)
    expect(expires).toBeGreaterThan(now() + 50 * 86400)

    await call('PUT', { token, body: notebook, headers: { 'if-none-match': '*' } })
    expect(bucket.store.has('users/555/progress.json')).toBe(true)

    const renewed = await call('POST', { token, path: '/v1/session' })
    expect(renewed.status).toBe(200)
    expect((await call('GET', { path: '/v1/session', token })).status).toBe(405)
  })
})

describe('session tokens', () => {
  it('reject tampering, other secrets and expiry', async () => {
    const { token } = await issueSession('123', SECRET)
    expect((await verifySession(token, SECRET)).sub).toBe('123')

    const [, payload, sig] = token.split('.')
    const forged = `vs1.${btoa(JSON.stringify({ sub: '999', iat: now(), exp: now() + 999 })).replace(/=+$/, '')}.${sig}`
    await expect(verifySession(forged, SECRET)).rejects.toThrow('Bad session')
    await expect(verifySession(token, 'another-secret-0123456789abcdefghij')).rejects.toThrow('Bad session')
    await expect(verifySession(token, SECRET, now() + 61 * 86400)).rejects.toThrow('Session expired')
    await expect(verifySession(`vs1.${payload}`, SECRET)).rejects.toThrow('Malformed')
    await expect(issueSession('1', 'short')).rejects.toThrow('SESSION_SECRET')
  })
})

describe('word data (Sketch Engine)', () => {
  const wsketch = {
    lpos: '-v',
    relfreq: 16.3,
    freq: 850891,
    Items: [
      { word: 'crime', cm: 'commit a crime', score: 9.1, gramrel: 'objects of "%w"' },
      { word: 'suicide', cm: 'commit suicide', score: 8.7, gramrel: 'objects of "%w"' },
      { word: 'deeply', cm: 'deeply committed to', score: 8.2, gramrel: 'modifiers of "%w"' },
      { word: 'they', cm: 'they commit', score: 5, gramrel: 'pronominal subjects of "%w"' },
    ],
  }
  const conc = { Lines: [{ Left: [{ str: 'He' }, { str: 'was' }], Kwic: [{ str: 'committed' }], Right: [{ str: 'to' }, { str: 'it' }, { str: '.' }] }] }
  const thes = { Words: [{ word: 'perpetrate', score: 0.3 }] }

  function upstream() {
    const calls: string[] = []
    const fetcher = async (url: string) => {
      calls.push(url)
      const method = new URL(url).pathname.split('/').pop()
      const body =
        method === 'wsketch' ? wsketch : method === 'concordance' ? conc : method === 'thes' ? thes : method === 'wordlist' ? { total: 3412 } : { content: {} }
      return new Response(JSON.stringify(body))
    }
    return { calls, fetcher }
  }

  let bucket: ReturnType<typeof fakeBucket>
  const env = (key: string | null = 'test-key') =>
    ({ BUCKET: bucket as unknown as R2Bucket, GOOGLE_CLIENT_ID: CLIENT_ID, SESSION_SECRET: SECRET, ALLOWED_ORIGINS: ORIGIN, SKETCH_ENGINE_KEY: key ?? undefined }) as Env
  const get = async (path: string, e: Env, fetcher: (url: string, init: RequestInit) => Promise<Response>, token?: string) =>
    handle(
      new Request(`https://sync.example${path}`, { headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) } }),
      e,
      fetchKeys,
      fetcher,
    )

  beforeAll(() => {
    bucket = fakeBucket()
  })

  it('shapes relations, drops pronouns, keeps the usual phrase', () => {
    const rels = shapeRelations(wsketch.Items)
    expect(rels.map((r) => r.name)).toEqual(['objects of "%w"', 'modifiers of "%w"'])
    expect(rels[0].items[0]).toEqual({ w: 'crime', p: 'commit a crime', s: 9.1 })
    expect(shapeExamples(conc.Lines)).toEqual([{ l: 'He was', k: 'committed', r: 'to it .' }])
    expect(
      shapeDiff({ common: [{ table: { Header: ['"%w" and/or ...'], Rows: [{ word: 'small', rnk1: 9.3, rnk2: 10.1, cnt1: 50, cnt2: 90 }] } }] }),
    ).toEqual([{ name: '"%w" and/or ...', rows: [{ w: 'small', a: 9.3, b: 10.1, ca: 50, cb: 90 }] }])
  })

  it('needs sign-in, fetches once and then serves everyone from the cache', async () => {
    const { calls, fetcher } = upstream()
    expect((await get('/v1/word?lemma=commit&pos=-v', env(), fetcher)).status).toBe(401)
    const token = (await issueSession('123', SECRET)).token
    const first = await get('/v1/word?lemma=Commit&pos=-v', env(), fetcher, token)
    expect(first.status).toBe(200)
    const body = (await first.json()) as { lemma: string; pos: string; perMillion: number; rels: unknown[]; examples: unknown[]; similar: unknown[] }
    expect(body).toMatchObject({ lemma: 'commit', pos: '-v', perMillion: 16.3 })
    expect(body.rels).toHaveLength(2)
    expect(body.examples).toHaveLength(1)
    expect(calls).toHaveLength(3) // wsketch, concordance, thesaurus
    expect(calls.every((u) => u.includes('corpname=preloaded%2Fententen21_tt31'))).toBe(true)

    const other = (await issueSession('456', SECRET)).token
    expect((await get('/v1/word?lemma=commit&pos=-v', env(), fetcher, other)).status).toBe(200)
    expect(calls).toHaveLength(3) // served from R2
  })

  it('accepts a maintenance token only while its secret exists, and only for word data', async () => {
    const { fetcher } = upstream()
    const secret = 'm'.repeat(40)
    const withToken = { ...env(), MAINTENANCE_TOKEN: secret } as Env
    expect((await get('/v1/word?lemma=commit&pos=-v', withToken, fetcher, `mt.${secret}`)).status).toBe(200)
    expect((await get('/v1/word?lemma=commit&pos=-v', env(), fetcher, `mt.${secret}`)).status).toBe(401)
    expect((await get('/v1/word?lemma=commit&pos=-v', withToken, fetcher, `mt.${'x'.repeat(40)}`)).status).toBe(401)
    expect((await get('/v1/notebook', withToken, fetcher, `mt.${secret}`)).status).toBe(401)
  })

  it('rejects bad input, answers 503 without a key and stops at the daily budget', async () => {
    const { fetcher } = upstream()
    const token = (await issueSession('123', SECRET)).token
    expect((await get('/v1/word?lemma=%3Cscript%3E', env(), fetcher, token)).status).toBe(400)
    expect((await get('/v1/word?lemma=linger', env(null), fetcher, token)).status).toBe(503)
    expect((await get('/v1/compare?a=big&b=big', env(), fetcher, token)).status).toBe(400)
    const today = new Date().toISOString().slice(0, 10)
    await bucket.put(`cache/ske/v1/budget/${today}.json`, JSON.stringify({ n: DAILY_BUDGET }))
    expect((await get('/v1/word?lemma=linger', env(), fetcher, token)).status).toBe(503)
  })
})
