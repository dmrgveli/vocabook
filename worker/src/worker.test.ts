import { beforeAll, describe, expect, it } from 'vitest'
import { verifyGoogleIdToken } from './google'
import { handle, type Env } from './index'
import { validateNotebook } from './schema'

const CLIENT_ID = 'test-client.apps.googleusercontent.com'
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

  const call = async (method: string, init: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { origin: ORIGIN, ...init.headers }
    if (init.token) headers.authorization = `Bearer ${init.token}`
    const req = new Request('https://sync.example/v1/notebook', {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    return handle(req, env, fetchKeys)
  }

  beforeAll(() => {
    bucket = fakeBucket()
    env = { BUCKET: bucket as unknown as R2Bucket, GOOGLE_CLIENT_ID: CLIENT_ID, ALLOWED_ORIGINS: ORIGIN }
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
})
