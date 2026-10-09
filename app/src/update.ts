import { useSyncExternalStore } from 'react'

// Phones keep tabs alive for days without reloading, so a phone can go on running an
// old build long after a new one is published. When the app comes back to the
// foreground (and every half hour), compare our build id with the published one.

declare const __BUILD_ID__: string

const CHECK_EVERY_MS = 30 * 60 * 1000
let available = false
const listeners = new Set<() => void>()

async function check() {
  if (__BUILD_ID__ === 'dev' || available || document.visibilityState !== 'visible') return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    const { build } = (await res.json()) as { build?: string }
    if (build && build !== __BUILD_ID__) {
      available = true
      listeners.forEach((l) => l())
    }
  } catch {
    // offline: try again later
  }
}

export function startUpdateCheck() {
  document.addEventListener('visibilitychange', () => void check())
  window.addEventListener('focus', () => void check())
  setInterval(() => void check(), CHECK_EVERY_MS)
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => available,
  )
}
