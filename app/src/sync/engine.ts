import { useSyncExternalStore } from 'react'
import { applySyncedEntries, listAllEntries, replaceAllEntries, subscribe } from '../data/db'
import type { Entry } from '../data/model'
import { getAuthState, getIdToken, subscribeAuth, syncConfigured } from './auth'
import { changedLocally, mergeNotebooks, stableStringify, wireNotebook, type SyncedNotebook } from './merge'

// Background sync between IndexedDB and the Worker. The device stays the source of
// truth for the user: everything is written locally first, then merged with the cloud
// copy using a conditional write (ETag). A conflicting write from another device fails
// with 412; we fetch again, merge again and retry.

const SYNC_URL = `${(import.meta.env.VITE_SYNC_URL ?? '').replace(/\/$/, '')}/v1/notebook`
const LAST_ACCOUNT_KEY = 'last-synced-account'
const DEBOUNCE_MS = 2500
const INTERVAL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 4

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing'; lastSynced?: number }
  | { state: 'synced'; lastSynced: number }
  | { state: 'offline'; lastSynced?: number }
  | { state: 'error'; message: string; lastSynced?: number }
  /** This device last synced another account; the user decides what happens to its words. */
  | { state: 'account-changed'; localWords: number; remoteWords: number }

let status: SyncStatus = { state: 'off' }
let lastSynced: number | undefined
const listeners = new Set<() => void>()

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

async function request<T>(method: string, token: string, init: { body?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(SYNC_URL, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new HttpError(res.status)
  return res.json() as Promise<T>
}

function readLastAccount(): string | undefined {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function writeLastAccount(sub: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, sub)
  } catch {
    // without storage the account check simply runs again next time
  }
}

let running: Promise<void> | undefined
let again = false

/** Syncs now; overlapping calls are folded into one extra run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = runSync().finally(() => {
    running = undefined
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

async function runSync(): Promise<void> {
  const auth = getAuthState()
  if (!syncConfigured || (auth.status !== 'signed-in' && auth.status !== 'expired')) return setStatus({ state: 'off' })
  if (status.state === 'account-changed') return

  setStatus({ state: 'syncing', lastSynced })
  const token = await getIdToken()
  if (!token) return setStatus({ state: 'off' })
  const sub = (getAuthState() as { user?: { sub: string } }).user?.sub

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const remote = await request<{ etag: string | null; notebook: SyncedNotebook | null }>('GET', token)
      const remoteEntries = remote.notebook?.version === 1 ? remote.notebook.entries : []
      const local = await listAllEntries()

      const lastAccount = readLastAccount()
      if (sub && lastAccount && lastAccount !== sub && local.some((e) => !e.deletedAt)) {
        return setStatus({
          state: 'account-changed',
          localWords: local.filter((e) => !e.deletedAt).length,
          remoteWords: remoteEntries.filter((e) => !e.deletedAt).length,
        })
      }

      const merged = mergeNotebooks(local, remoteEntries)
      await applySyncedEntries(changedLocally(local, merged))

      const wire = wireNotebook(merged)
      const remoteWire = remote.notebook ? wireNotebook(remoteEntries) : undefined
      if (!remoteWire || stableStringify(wire) !== stableStringify(remoteWire)) {
        try {
          await request('PUT', token, {
            body: JSON.stringify(wire),
            headers: remote.etag ? { 'If-Match': remote.etag } : { 'If-None-Match': '*' },
          })
        } catch (err) {
          if (err instanceof HttpError && err.status === 412 && attempt < MAX_ATTEMPTS) continue
          throw err
        }
      }

      if (sub) writeLastAccount(sub)
      lastSynced = Date.now()
      return setStatus({ state: 'synced', lastSynced })
    }
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) return setStatus({ state: 'off' })
    if (err instanceof HttpError && err.status === 413)
      return setStatus({ state: 'error', message: 'Your notebook is too large to sync.', lastSynced })
    if (!navigator.onLine || err instanceof TypeError || (err as Error).name === 'TimeoutError')
      return setStatus({ state: 'offline', lastSynced })
    setStatus({ state: 'error', message: 'Sync failed. It will try again shortly.', lastSynced })
  }
}

/**
 * Settles an account switch. 'merge' adds this device's words to the signed-in account;
 * 'replace' discards them on this device and loads that account's notebook instead.
 */
export async function resolveAccountChange(choice: 'merge' | 'replace') {
  const auth = getAuthState()
  if (auth.status !== 'signed-in') return
  if (choice === 'replace') {
    const token = await getIdToken()
    if (!token) return
    const remote = await request<{ notebook: SyncedNotebook | null }>('GET', token)
    await replaceAllEntries(remote.notebook?.entries ?? ([] as Entry[]))
  }
  writeLastAccount(auth.user.sub)
  setStatus({ state: 'syncing', lastSynced })
  await syncNow()
}

/** Removes the cloud copy; this device keeps its words. */
export async function deleteCloudCopy(): Promise<boolean> {
  const token = await getIdToken()
  if (!token) return false
  await request('DELETE', token)
  setStatus({ state: 'off' })
  return true
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleSync(delay = DEBOUNCE_MS) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

let started = false

/** Wires sync to local edits, sign-in, focus, reconnects and a slow interval. */
export function startSync() {
  if (started || !syncConfigured) return
  started = true
  subscribe((origin) => origin === 'local' && scheduleSync())
  let wasSignedIn = false
  subscribeAuth(() => {
    const signedIn = getAuthState().status === 'signed-in'
    if (signedIn && !wasSignedIn) {
      // a fresh sign-in (maybe another account) re-runs the account check from scratch
      setStatus({ state: 'off' })
      void syncNow()
    }
    if (!signedIn && getAuthState().status === 'signed-out') setStatus({ state: 'off' })
    wasSignedIn = signedIn
  })
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('focus', () => scheduleSync(500))
  setInterval(() => void syncNow(), INTERVAL_MS)
}
