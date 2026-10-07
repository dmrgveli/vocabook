import { AuthError, verifyGoogleIdToken, type KeyFetcher } from './google'
import { MAX_BODY_BYTES, SchemaError, validateNotebook } from './schema'

// Sync API for the notebook.
//   GET    /v1/notebook  → { etag, notebook }   (both null when nothing is stored yet)
//   PUT    /v1/notebook  ← notebook JSON, with If-Match: <etag> or If-None-Match: *  → { etag }
//   DELETE /v1/notebook  → removes the stored copy
// Every request carries a Google ID token; the storage path comes only from its `sub`.

export interface Env {
  BUCKET: R2Bucket
  GOOGLE_CLIENT_ID: string
  /** Comma-separated list of origins allowed to call the API. */
  ALLOWED_ORIGINS: string
}

const objectKey = (sub: string) => `users/${sub}/progress.json`

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  })
}

/** Reads the body while enforcing the size limit, without trusting Content-Length. */
async function readLimited(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new SchemaError('Too large')
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) throw new SchemaError('Too large')
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function handle(request: Request, env: Env, fetchKeys?: KeyFetcher): Promise<Response> {
  const cors = corsHeaders(request.headers.get('origin'), env)
  const { pathname } = new URL(request.url)

  if (request.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors })
  if (pathname !== '/v1/notebook') return json({ error: 'Not found' }, 404, cors)

  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) return json({ error: 'Sign-in required' }, 401, cors)

  let sub: string
  try {
    sub = (await verifyGoogleIdToken(token, env.GOOGLE_CLIENT_ID, { fetchKeys })).sub
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401, cors)
    throw err
  }
  const key = objectKey(sub)

  if (request.method === 'GET') {
    const object = await env.BUCKET.get(key)
    if (!object) return json({ etag: null, notebook: null }, 200, cors)
    return json({ etag: object.etag, notebook: await object.json() }, 200, cors)
  }

  if (request.method === 'DELETE') {
    await env.BUCKET.delete(key)
    return json({ ok: true }, 200, cors)
  }

  if (request.method === 'PUT') {
    let text: string
    let notebook: unknown
    try {
      text = await readLimited(request)
      notebook = JSON.parse(text)
      validateNotebook(notebook)
    } catch (err) {
      if (err instanceof SchemaError && err.message === 'Too large') return json({ error: 'Notebook is too large' }, 413, cors)
      if (err instanceof SchemaError || err instanceof SyntaxError) return json({ error: (err as Error).message }, 400, cors)
      throw err
    }

    const ifMatch = request.headers.get('if-match')
    const ifNoneMatch = request.headers.get('if-none-match')
    if (!ifMatch && ifNoneMatch !== '*') return json({ error: 'If-Match or If-None-Match: * is required' }, 428, cors)

    // Conditional write: a conflicting write from another device fails with 412 and
    // the client merges and retries.
    if (ifNoneMatch === '*') {
      // R2 has no "create only" condition; a head check closes all but a tiny window,
      // and the local-first clients heal that window on their next sync.
      if (await env.BUCKET.head(key)) return json({ error: 'Conflict' }, 412, cors)
      const object = await env.BUCKET.put(key, text, { httpMetadata: { contentType: 'application/json' } })
      return json({ etag: object.etag }, 200, cors)
    }
    const object = await env.BUCKET.put(key, text, {
      onlyIf: { etagMatches: ifMatch!.replace(/^"|"$/g, '') },
      httpMetadata: { contentType: 'application/json' },
    })
    if (!object) return json({ error: 'Conflict' }, 412, cors)
    return json({ etag: object.etag }, 200, cors)
  }

  return json({ error: 'Method not allowed' }, 405, cors)
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env)
    } catch (err) {
      console.error(err)
      return json({ error: 'Internal error' }, 500, corsHeaders(request.headers.get('origin'), env))
    }
  },
} satisfies ExportedHandler<Env>
