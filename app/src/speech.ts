import { useEffect, useState, useSyncExternalStore } from 'react'

// Pronunciation through the browser's own text-to-speech (Web Speech API).
// The chosen voice and rate are a per-device preference, kept in localStorage.

export interface SpeechPrefs {
  voiceURI?: string
  rate: number
}

const KEY = 'speech-prefs'
const DEFAULT_PREFS: SpeechPrefs = { rate: 0.9 }

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

function readPrefs(): SpeechPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

let prefs = readPrefs()
const prefListeners = new Set<() => void>()

export function setSpeechPrefs(next: Partial<SpeechPrefs>) {
  prefs = { ...prefs, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable (private mode): keep the preference for this session only
  }
  prefListeners.forEach((l) => l())
}

export function useSpeechPrefs(): SpeechPrefs {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l)
      return () => prefListeners.delete(l)
    },
    () => prefs,
  )
}

// macOS ships joke voices that are useless for pronunciation.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Kathy|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i

function voiceScore(v: SpeechSynthesisVoice): number {
  let score = 0
  if (/en[-_](US|GB)/i.test(v.lang)) score += 4
  if (/en[-_]US/i.test(v.lang)) score += 1
  if (/(enhanced|premium|natural|neural)/i.test(v.name)) score += 3
  if (/^(Google|Samantha|Daniel|Karen|Moira|Ava|Allison|Serena|Microsoft (Aria|Jenny|Guy|Libby|Ryan|Sonia))/i.test(v.name)) score += 2
  if (v.localService) score += 1
  return score
}

/** English voices, most natural first. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (supported ? englishVoices() : []))
  useEffect(() => {
    if (!supported) return
    const update = () => setVoices(englishVoices())
    update()
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

function englishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en') && !NOVELTY.test(v.name))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name))
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = englishVoices()
  return voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0]
}

/** The text currently being spoken, so buttons can show it. */
let speaking: string | null = null
const speakingListeners = new Set<() => void>()
const setSpeaking = (text: string | null) => {
  speaking = text
  speakingListeners.forEach((l) => l())
}

export function useSpeaking(): string | null {
  return useSyncExternalStore(
    (l) => {
      speakingListeners.add(l)
      return () => speakingListeners.delete(l)
    },
    () => speaking,
  )
}

export const canSpeak = supported

export function speak(text: string, { slow = false, voiceURI }: { slow?: boolean; voiceURI?: string } = {}) {
  if (!supported) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = voiceURI ? englishVoices().find((v) => v.voiceURI === voiceURI) : pickVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.rate = slow ? Math.max(0.4, prefs.rate * 0.6) : prefs.rate
  const key = slow ? `${text}#slow` : text
  u.onstart = () => setSpeaking(key)
  u.onend = u.onerror = () => speaking === key && setSpeaking(null)
  speechSynthesis.speak(u)
}
