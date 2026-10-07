import { useSyncExternalStore } from 'react'

// Light / dark / follow the system. The choice is a per-device preference (localStorage);
// it is applied as data-theme on <html>, which styles/tokens.css reads.

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
const listeners = new Set<() => void>()
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = read()

function apply() {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
}

export function initTheme() {
  apply()
  // Following the system: re-render things that depend on the resolved theme.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => listeners.forEach((l) => l()))
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // storage unavailable: the choice lasts for this session
  }
  apply()
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref)
}

/** The theme actually on screen. */
export function resolvedTheme(): 'light' | 'dark' {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref
}

export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, resolvedTheme)
}
