import { useSyncExternalStore } from 'react'

// Google sign-in with Google Identity Services. The ID token lives in memory only
// (never in localStorage); a "was signed in" hint lets the next visit sign in again
// silently through One Tap / FedCM auto-select.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const syncConfigured = Boolean(GOOGLE_CLIENT_ID && import.meta.env.VITE_SYNC_URL)

const GIS_URL = 'https://accounts.google.com/gsi/client'
const HINT_KEY = 'signed-in-hint'
/** Refresh a little before Google's one-hour expiry. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

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
  setState({ status: 'signed-in', user })
  waiters.forEach((w) => w(token!.value))
  waiters = []
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

/** On start-up: if this device was signed in before, try to get a token silently. */
export async function initAuth() {
  if (!syncConfigured) return
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

/** Draws Google's own sign-in button into the element. */
export async function renderSignInButton(el: HTMLElement) {
  const id = await loadGis()
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  id.renderButton(el, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with' })
}

/**
 * A valid ID token, refreshing it through silent sign-in when it is about to expire.
 * Resolves to undefined when the user has to sign in again.
 */
export async function getIdToken(): Promise<string | undefined> {
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
  writeHint(undefined)
  window.google?.accounts.id.disableAutoSelect()
  setState({ status: 'signed-out' })
}
