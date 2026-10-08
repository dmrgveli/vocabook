import { useSyncExternalStore } from 'react'
import { metEncounters, type Entry, type Mastery } from './model'

// "A page from your notebook": when the app opens and the notebook has enough words,
// a small, dismissable pop-up invites the user to look at a few words they haven't
// seen in a while. An invitation, not a test: nothing is graded or counted.

export const REMINDER_MIN_WORDS = 10
const MAX_WORDS = 5
const MIN_WORDS_TO_SHOW = 3
const RESTING_DAYS = 1
const PREF_KEY = 'reminders-enabled'
const SHOWN_KEY = 'reminder-shown'

/** Words you know less well come back sooner. */
const MASTERY_WEIGHT: Record<Mastery, number> = { recognize: 1, understand: 0.7, use: 0.4 }

const DAY = 864e5

/**
 * The words to suggest: not looked at for at least a day, ranked by time since last
 * seen weighted by mastery. Undefined when there isn't enough to make a page.
 */
export function pickReminderWords(entries: Entry[], now = Date.now()): Entry[] | undefined {
  const words = entries.filter((e) => !e.deletedAt)
  if (words.length < REMINDER_MIN_WORDS) return undefined
  const ranked = words
    .map((e) => {
      const lastSeen = Date.parse(e.lastViewedAt ?? e.createdAt)
      const days = (now - lastSeen) / DAY
      return { e, days, score: days * MASTERY_WEIGHT[e.mastery] }
    })
    .filter((x) => x.days >= RESTING_DAYS)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_WORDS)
    .map((x) => x.e)
  return ranked.length >= MIN_WORDS_TO_SHOW ? ranked : undefined
}

/** What to reveal when the user asks "what did it mean?". */
export function reminderHint(entry: Entry): string | undefined {
  return entry.translation ?? entry.enrichment?.meanings[0]?.definitions[0]?.definition
}

export function reminderSource(entry: Entry): string | undefined {
  return metEncounters(entry).sort((a, b) => a.date.localeCompare(b.date))[0]?.source
}

/* ---------- preference + once per app opening ---------- */

const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = readEnabled()

export function setRemindersEnabled(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the choice lasts for this session
  }
  listeners.forEach((l) => l())
}

export function useRemindersEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
  )
}

/** sessionStorage survives reloads but not closing the tab: "once each time the app is opened". */
export function alreadyShownThisVisit(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

export function markShownThisVisit() {
  try {
    sessionStorage.setItem(SHOWN_KEY, '1')
  } catch {
    // without storage it may show again after a reload, which is harmless
  }
}
