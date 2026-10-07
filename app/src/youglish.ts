import { useSyncExternalStore } from 'react'

// YouGlish JS API (https://youglish.com/api/doc/js-api). The widget plays YouTube
// clips, which can set cookies, so it is only loaded after the user agrees.

const SCRIPT_URL = 'https://youglish.com/public/emb/widget.js'
const CONSENT_KEY = 'youglish-consent'

export interface YGWidget {
  fetch(query: string, lang: string, accent?: string): void
  next(): void
  previous(): void
  replay(): void
  pause(): void
  close(): void
}

interface YGEvent {
  totalResult?: number
  trackNumber?: number
}

export interface YGOptions {
  width?: number
  components: number
  autoStart?: 0 | 1
  backgroundColor?: string
  textColor?: string
  linkColor?: string
  titleColor?: string
  captionColor?: string
  keywordColor?: string
  queryColor?: string
  markerColor?: string
  panelsBackgroundColor?: string
  events?: Partial<Record<'onFetchDone' | 'onVideoChange' | 'onError', (e: YGEvent) => void>>
}

interface YGNamespace {
  Widget: new (elementId: string, options: YGOptions) => YGWidget
}

declare global {
  interface Window {
    YG?: YGNamespace
  }
}

/** Widget components, summed into the `components` option. */
export const YG_COMPONENTS = { title: 4, caption: 8, speed: 16, controls: 64 } as const

let loading: Promise<YGNamespace> | undefined

/** Loads widget.js once. The script defines window.YG synchronously when it runs. */
export function loadYouGlish(): Promise<YGNamespace> {
  loading ??= new Promise<YGNamespace>((resolve, reject) => {
    if (window.YG) return resolve(window.YG)
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.YG ? resolve(window.YG) : reject(new Error('YouGlish did not load')))
    script.onerror = () => {
      loading = undefined
      script.remove()
      reject(new Error('YouGlish could not be reached'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/* ---------- consent ---------- */

const listeners = new Set<() => void>()

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

let consent = readConsent()

export function setYouGlishConsent(granted: boolean) {
  consent = granted
  try {
    if (granted) localStorage.setItem(CONSENT_KEY, 'granted')
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    // storage unavailable: consent lasts for this session only
  }
  listeners.forEach((l) => l())
}

export function useYouGlishConsent(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => consent,
  )
}

export const YOUTUBE_TERMS_URL = 'https://www.youtube.com/t/terms'
export const GOOGLE_PRIVACY_URL = 'https://policies.google.com/privacy'
