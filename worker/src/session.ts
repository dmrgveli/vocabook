// Our own sign-in session, so a page reload does not need Google again.
//
// After the Worker has verified a Google ID token it hands out a session token:
//   vs1.<base64url payload>.<base64url HMAC-SHA256 signature>
// The payload holds only the Google subject and the expiry. It is signed with
// SESSION_SECRET (a Worker secret); changing that secret signs everyone out.

import { AuthError } from './google'

export const SESSION_PREFIX = 'vs1.'
/** How long a session lasts. Clients renew it well before it runs out. */
export const SESSION_SECONDS = 60 * 24 * 60 * 60

interface SessionClaims {
  sub: string
  iat: number
  exp: number
}

const encoder = new TextEncoder()

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromB64url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is not configured')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export const isSessionToken = (token: string) => token.startsWith(SESSION_PREFIX)

export async function issueSession(sub: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const claims: SessionClaims = { sub, iat: now, exp: now + SESSION_SECONDS }
  const payload = b64url(encoder.encode(JSON.stringify(claims)))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload)))
  return { token: `${SESSION_PREFIX}${payload}.${b64url(signature)}`, expires: claims.exp }
}

export async function verifySession(token: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<SessionClaims> {
  const parts = token.slice(SESSION_PREFIX.length).split('.')
  if (!isSessionToken(token) || parts.length !== 2) throw new AuthError('Malformed session')
  const [payload, signature] = parts
  let sig: Uint8Array
  try {
    sig = fromB64url(signature)
  } catch {
    throw new AuthError('Malformed session')
  }
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, encoder.encode(payload))
  if (!valid) throw new AuthError('Bad session')
  let claims: SessionClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(payload)))
  } catch {
    throw new AuthError('Malformed session')
  }
  if (typeof claims.exp !== 'number' || claims.exp < now) throw new AuthError('Session expired')
  if (typeof claims.sub !== 'string' || !/^\d{1,64}$/.test(claims.sub)) throw new AuthError('Bad subject')
  return claims
}
