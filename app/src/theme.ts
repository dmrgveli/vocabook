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
  applyAccent()
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

/* ---------- accent colour ---------- */

// The highlighter colour (--marker): main buttons, highlights, the selected chip, the
// word stickers. Only that colour changes; K-band and mastery colours keep their meaning.
// Applied as inline custom properties on <html>, so it wins over the light and dark palettes.

export const DEFAULT_ACCENT = '#ffd84d'

export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: 'Highlighter', color: DEFAULT_ACCENT },
  { name: 'Lime', color: '#cdee5a' },
  { name: 'Mint', color: '#86e3a8' },
  { name: 'Sky', color: '#8fcdff' },
  { name: 'Lilac', color: '#c4a8ff' },
  { name: 'Pink', color: '#ff9fc6' },
  { name: 'Peach', color: '#ffb48a' },
  { name: 'Coral', color: '#ff6f52' },
]

const ACCENT_KEY = 'accent'
const INK = '#1b1a1f'
const WHITE = '#ffffff'

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

function readAccent(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    return isHex(v) ? v.toLowerCase() : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

let accent = readAccent()

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Text colour on top of the accent: dark ink unless the accent is too dark for it. */
export const inkOn = (color: string) => (contrast(color, INK) >= contrast(color, WHITE) ? INK : WHITE)

function applyAccent() {
  const style = document.documentElement.style
  if (accent === DEFAULT_ACCENT) {
    style.removeProperty('--marker')
    style.removeProperty('--marker-ink')
  } else {
    style.setProperty('--marker', accent)
    style.setProperty('--marker-ink', inkOn(accent))
  }
}

export function setAccent(color: string) {
  if (!isHex(color)) return
  accent = color.toLowerCase()
  try {
    if (accent === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_KEY)
    else localStorage.setItem(ACCENT_KEY, accent)
  } catch {
    // storage unavailable: the colour lasts for this session
  }
  applyAccent()
  listeners.forEach((l) => l())
}

export function useAccent(): string {
  return useSyncExternalStore(subscribe, () => accent)
}
