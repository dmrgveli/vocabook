import { useSyncExternalStore } from 'react'
import { switchProfile } from '../data/db'
import { resolvedTheme } from '../theme'

// Google sign-in with Google Identity Services, then a session from our Worker.
//
// Google's ID token lasts an hour and is kept in memory only. Right after sign-in the
// Worker trades it for its own session token (60 days, renewed while the app is used),
// which is kept in localStorage so a reload or a new visit stays signed in without
// asking Google again. Silent re-sign-in through One Tap / FedCM was not reliable
// enough for that: browsers rate-limit it and Safari and Firefox lack FedCM.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const SYNC_BASE: string = (import.meta.env.VITE_SYNC_URL ?? '').replace(/\/$/, '')
export const syncConfigured = Boolean(GOOGLE_CLIENT_ID && SYNC_BASE)

const GIS_URL = 'https://accounts.google.com/gsi/client'
/** Profile shown while signed out after an expired session ("sign in again"). */
const HINT_KEY = 'signed-in-hint'
const SESSION_KEY = 'sync-session'
/** Refresh a little before Google's one-hour expiry. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000
/** Renew the session once less than this is left (sessions last 60 days). */
const RENEW_BEFORE_MS = 45 * 24 * 60 * 60 * 1000

interface Session {
  token: string
  /** ms since epoch */
  expires: number
  user: User
}

export interface User {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export type AuthState =
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'signed-in'; user: User }
  /** Was signed in, but the token expired and silent sign-in did not work. */
  | { status: 'expired'; user: User }

interface GoogleId {
  initialize(config: Record<string, unknown>): void
  prompt(listener?: (n: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void): void
  renderButton(el: HTMLElement, options: Record<string, unknown>): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let state: AuthState = { status: syncConfigured ? 'signed-out' : 'unconfigured' }
let token: { value: string; expires: number } | undefined
let session: Session | undefined = readSession()
const listeners = new Set<() => void>()
let waiters: ((t: string | undefined) => void)[] = []

function setState(next: AuthState) {
  state = next
  listeners.forEach((l) => l())
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function getAuthState(): AuthState {
  return state
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readHint(): User | undefined {
  try {
    return JSON.parse(localStorage.getItem(HINT_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

function writeHint(user: User | undefined) {
  try {
    if (user) localStorage.setItem(HINT_KEY, JSON.stringify(user))
    else localStorage.removeItem(HINT_KEY)
  } catch {
    // storage unavailable: the user signs in again next visit
  }
}

function readSession(): Session | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return s && typeof s.token === 'string' && s.expires > Date.now() && s.user?.sub ? s : undefined
  } catch {
    return undefined
  }
}

function saveSession(next: Session | undefined) {
  session = next
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable: the session lasts until the page closes
  }
}

let exchanging: Promise<string | undefined> | undefined

/** Trades a Google ID token, or a session that is still valid, for a fresh session. */
function exchange(credential: string, user: User): Promise<string | undefined> {
  exchanging ??= (async () => {
    try {
      const res = await fetch(`${SYNC_BASE}/v1/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credential}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 401 && credential === session?.token) {
        // the Worker no longer accepts this session (e.g. its key was changed)
        invalidateSession()
        return undefined
      }
      if (!res.ok) return undefined
      const body = (await res.json()) as { token: string; expires: number }
      saveSession({ token: body.token, expires: body.expires * 1000, user })
      return body.token
    } catch {
      return undefined // offline: try again on the next sync
    } finally {
      exchanging = undefined
    }
  })()
  return exchanging
}

/** Reads the claims for display; the Worker is what actually verifies the token. */
function decodeClaims(jwt: string): (User & { exp: number }) | undefined {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      [...atob(payload)].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    )
    const c = JSON.parse(json)
    return { sub: c.sub, email: c.email, name: c.name, picture: c.picture, exp: c.exp }
  } catch {
    return undefined
  }
}

function onCredential(response: { credential?: string }) {
  const claims = response.credential ? decodeClaims(response.credential) : undefined
  if (!response.credential || !claims) return
  token = { value: response.credential, expires: claims.exp * 1000 }
  const user: User = { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture }
  writeHint(user)
  // this account's own notebook on the device (data/db.ts)
  switchProfile(user.sub)
  setState({ status: 'signed-in', user })
  waiters.forEach((w) => w(token!.value))
  waiters = []
  void exchange(response.credential, user)
}

let gisLoading: Promise<GoogleId> | undefined

function loadGis(): Promise<GoogleId> {
  gisLoading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_URL
    script.async = true
    script.onload = () => {
      const id = window.google?.accounts.id
      if (!id) return reject(new Error('Google sign-in did not load'))
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
        cancel_on_tap_outside: false,
      })
      resolve(id)
    }
    script.onerror = () => {
      gisLoading = undefined
      script.remove()
      reject(new Error('Google sign-in could not be reached'))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

/**
 * On start-up: a stored session means signed in straight away. Devices signed in before
 * sessions existed (only the hint is there) get one silent Google attempt.
 */
export async function initAuth() {
  if (!syncConfigured) return
  if (session) return setState({ status: 'signed-in', user: session.user })
  const hint = readHint()
  if (!hint) return
  setState({ status: 'expired', user: hint })
  try {
    const id = await loadGis()
    id.prompt()
  } catch {
    // offline or blocked: stays 'expired' until the user signs in again
  }
}

/** The Worker rejected our session: ask the user to sign in again. */
export function invalidateSession() {
  const user = session?.user ?? (state.status === 'signed-in' ? state.user : undefined)
  saveSession(undefined)
  token = undefined
  if (user) setState({ status: 'expired', user })
}

/** Draws Google's own sign-in button into the element. */
export async function renderSignInButton(el: HTMLElement, width?: number) {
  const id = await loadGis()
  const dark = resolvedTheme() === 'dark'
  id.renderButton(el, {
    type: 'standard',
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    logo_alignment: 'left',
    // The app is always in English, whatever the browser's language.
    locale: 'en',
    ...(width ? { width } : {}),
  })
}

/**
 * A token for the sync API: the session (renewed when it gets old), else a fresh Google
 * ID token, else one silent Google sign-in attempt. Undefined when the user has to sign in again.
 */
export async function getAuthToken(): Promise<string | undefined> {
  if (session && session.expires - EXPIRY_MARGIN_MS > Date.now()) {
    if (session.expires - RENEW_BEFORE_MS < Date.now()) void exchange(session.token, session.user)
    return session.token
  }
  if (token && token.expires - EXPIRY_MARGIN_MS > Date.now()) return token.value
  if (state.status === 'signed-in') setState({ status: 'expired', user: state.user })
  if (state.status !== 'expired') return undefined
  try {
    const id = await loadGis()
    return await new Promise<string | undefined>((resolve) => {
      waiters.push(resolve)
      id.prompt((n) => {
        if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) {
          waiters = waiters.filter((w) => w !== resolve)
          resolve(undefined)
        }
      })
      setTimeout(() => {
        waiters = waiters.filter((w) => w !== resolve)
        resolve(undefined)
      }, 15_000)
    })
  } catch {
    return undefined
  }
}

export function signOut() {
  token = undefined
  saveSession(undefined)
  writeHint(undefined)
  // back to the notebook kept without an account
  switchProfile(null)
  window.google?.accounts.id.disableAutoSelect()
  setState({ status: 'signed-out' })
}
