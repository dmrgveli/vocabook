// Spaced repetition, computed from what is already stored: each finished Flashback round
// writes its result on the word's timeline (data/flashback.ts), so the schedule needs no
// extra data, syncs with the words and never conflicts. An SM-2 style scheduler:
//   remembered first try  → the gap grows (1 → 3 days → × ease), ease rises a little
//   remembered second time → the gap barely grows, ease drops
//   still settling in     → back to tomorrow, ease drops more
// Practising a word long before it is due (a free round, a hand-picked selection) does not
// stretch its gap: spacing only counts when time has passed. No penalties, no streak loss.

import type { Entry, Mastery } from './model'
import { practiceResults, type RoundResult } from './flashback'

const DAY = 864e5
export const MAX_INTERVAL_DAYS = 365
/** A new word is first asked about a day after you add it (sooner recall is too easy); words you already use, later. */
const FIRST_GAP: Record<Mastery, number> = { recognize: 1, understand: 2, use: 4 }
const START_EASE = 2.3
const MIN_EASE = 1.3

export interface Schedule {
  /** when the word is due (ms) */
  due: number
  /** current gap in days (0 = never reviewed) */
  interval: number
  ease: number
  reviews: number
  lapses: number
}

export function scheduleOf(entry: Entry): Schedule {
  const added = Date.parse(entry.createdAt)
  let s: Schedule = { due: added + FIRST_GAP[entry.mastery] * DAY, interval: 0, ease: START_EASE, reviews: 0, lapses: 0 }
  for (const { at, result } of practiceResults(entry)) s = review(s, at, result)
  return s
}

function review(s: Schedule, at: number, result: RoundResult): Schedule {
  const early = s.interval > 0 && at < s.due - (s.interval * DAY) / 2
  let { interval, ease, lapses } = s
  if (result === 'first-try') {
    if (!early) interval = interval === 0 ? 1 : interval < 3 ? 3 : Math.round(interval * ease)
    ease = Math.min(3, ease + 0.05)
  } else if (result === 'came-back') {
    interval = Math.max(1, early ? interval : Math.round(interval * 1.2))
    ease = Math.max(MIN_EASE, ease - 0.15)
  } else {
    interval = 1
    ease = Math.max(MIN_EASE, ease - 0.2)
    lapses++
  }
  interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval))
  return { due: at + interval * DAY, interval, ease, reviews: s.reviews + 1, lapses }
}

/** End of today (local): everything due before then counts as due today. */
export function endOfToday(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Words due today, the most overdue (relative to their gap) first. */
export function dueEntries(entries: Entry[], now = Date.now()): Entry[] {
  const limit = endOfToday(now)
  return entries
    .filter((e) => !e.deletedAt)
    .map((e) => ({ e, s: scheduleOf(e) }))
    .filter(({ s }) => s.due <= limit)
    .sort((a, b) => (now - b.s.due) / Math.max(1, b.s.interval) - (now - a.s.due) / Math.max(1, a.s.interval))
    .map(({ e }) => e)
}

/** The next time anything is due, and how many words then, for "all caught up". */
export function nextDue(entries: Entry[], now = Date.now()): { at: number; count: number } | undefined {
  const days = new Map<number, number>()
  for (const e of entries) {
    if (e.deletedAt) continue
    const due = scheduleOf(e).due
    if (due <= endOfToday(now)) continue
    const day = endOfToday(due)
    days.set(day, (days.get(day) ?? 0) + 1)
  }
  const first = Math.min(...days.keys())
  return Number.isFinite(first) ? { at: first, count: days.get(first)! } : undefined
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks" */
export function whenLabel(at: number, now = Date.now()): string {
  const days = Math.round((endOfToday(at) - endOfToday(now)) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 60) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30)} months`
}
