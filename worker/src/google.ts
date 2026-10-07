// Verifies Google ID tokens (RS256 JWTs) with Google's published keys:
// signature, issuer, audience (our client ID) and expiry.

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])
const CLOCK_SKEW_SECONDS = 60

export interface GoogleUser {
  sub: string
  email?: string
}

interface Jwk extends JsonWebKey {
  kid: string
}

export type KeyFetcher = () => Promise<Jwk[]>

let cachedKeys: { keys: Jwk[]; expires: number } | undefined

/** Google's signing keys, cached for as long as Google's Cache-Control allows. */
export const fetchGoogleKeys: KeyFetcher = async () => {
  if (cachedKeys && cachedKeys.expires > Date.now()) return cachedKeys.keys
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`Could not fetch Google keys (${res.status})`)
  const { keys } = (await res.json()) as { keys: Jwk[] }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600)
  cachedKeys = { keys, expires: Date.now() + maxAge * 1000 }
  return keys
}

export class AuthError extends Error {}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function decodeJson<T>(part: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T
  } catch {
    throw new AuthError('Malformed token')
  }
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  { fetchKeys = fetchGoogleKeys, now = Date.now() / 1000 }: { fetchKeys?: KeyFetcher; now?: number } = {},
): Promise<GoogleUser> {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured')
  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError('Malformed token')
  const [headerPart, payloadPart, signaturePart] = parts

  const header = decodeJson<{ alg?: string; kid?: string }>(headerPart)
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError('Unsupported token')

  const jwk = (await fetchKeys()).find((k) => k.kid === header.kid)
  if (!jwk) throw new AuthError('Unknown signing key')
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!valid) throw new AuthError('Bad signature')

  const claims = decodeJson<{ iss?: string; aud?: string; exp?: number; iat?: number; sub?: string; email?: string }>(payloadPart)
  if (!claims.iss || !ISSUERS.has(claims.iss)) throw new AuthError('Wrong issuer')
  if (claims.aud !== clientId) throw new AuthError('Wrong audience')
  if (typeof claims.exp !== 'number' || claims.exp < now - CLOCK_SKEW_SECONDS) throw new AuthError('Token expired')
  if (typeof claims.iat === 'number' && claims.iat > now + CLOCK_SKEW_SECONDS) throw new AuthError('Token from the future')
  // Google subject IDs are numeric strings; anything else must never reach a storage path.
  if (typeof claims.sub !== 'string' || !/^\d{1,64}$/.test(claims.sub)) throw new AuthError('Bad subject')

  return { sub: claims.sub, email: claims.email }
}
