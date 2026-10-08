import { alive, metEncounters, type Entry } from './model'
import { localDay } from './notebook'

// Streaks, activity and achievements, all derived from the notebook itself: nothing
// extra is stored, so every synced device shows the same thing. In the spirit of the
// app this is encouragement, never pressure: a streak only "ends" after a full day
// without activity, and missing a day is never announced.

const DAY = 864e5

/** Days (YYYY-MM-DD, local) on which the user did something with their notebook. */
export function activityByDay(entries: Entry[]): Map<string, number> {
  const days = new Map<string, number>()
  const add = (ts?: string) => ts && days.set(localDay(ts), (days.get(localDay(ts)) ?? 0) + 1)
  for (const e of entries) {
    if (e.deletedAt) continue
    add(e.createdAt)
    add(e.lastViewedAt)
    // the first encounter is created together with the word; count it once
    for (const enc of alive(e.encounters)) if (enc.createdAt !== e.createdAt) add(enc.createdAt)
    for (const n of alive(e.notes)) add(n.createdAt)
  }
  return days
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return localDay(d.toISOString())
}

export interface Streaks {
  /** Consecutive active days ending today, or yesterday if today hasn't started yet. */
  current: number
  longest: number
  activeToday: boolean
}

export function streaks(active: Set<string> | Map<string, number>, today = localDay(new Date().toISOString())): Streaks {
  const has = (d: string) => active.has(d)
  let start = has(today) ? today : dayBefore(today)
  let current = 0
  while (has(start)) {
    current++
    start = dayBefore(start)
  }
  let longest = 0
  for (const day of active.keys()) {
    if (has(dayBefore(day))) continue // not the first day of a run
    let run = 0
    let d = day
    while (has(d)) {
      run++
      const next = new Date(`${d}T12:00:00`)
      next.setDate(next.getDate() + 1)
      d = localDay(next.toISOString())
    }
    longest = Math.max(longest, run)
  }
  return { current, longest: Math.max(longest, current), activeToday: has(today) }
}

/** The last `weeks` full weeks as columns of 7 days (Mon–Sun), oldest first, for a heatmap. */
export function heatmap(active: Map<string, number>, weeks = 12, now = new Date()): { day: string; count: number; future: boolean }[][] {
  const today = localDay(now.toISOString())
  const end = new Date(`${today}T12:00:00`)
  const daysToSunday = (7 - ((end.getDay() + 6) % 7) - 1) % 7
  end.setDate(end.getDate() + daysToSunday)
  const columns: { day: string; count: number; future: boolean }[][] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const col = []
    for (let d = 6; d >= 0; d--) {
      const date = new Date(end.getTime() - (w * 7 + d) * DAY)
      const day = localDay(date.toISOString())
      col.push({ day, count: active.get(day) ?? 0, future: day > today })
    }
    columns.push(col)
  }
  return columns
}

export interface Stats {
  words: number
  thisWeek: number
  inUse: number
  encounters: number
  sentences: number
  notes: number
  sources: number
  metAgain: number
  rareWords: number
  longestStreak: number
}

export function stats(entries: Entry[], isRare: (word: string) => boolean, now = Date.now()): Stats {
  const words = entries.filter((e) => !e.deletedAt)
  const sources = new Set(words.flatMap((e) => metEncounters(e).map((x) => x.source)))
  return {
    words: words.length,
    thisWeek: words.filter((e) => Date.parse(e.createdAt) > now - 7 * DAY).length,
    inUse: words.filter((e) => e.mastery === 'use').length,
    encounters: words.reduce((n, e) => n + metEncounters(e).length, 0),
    sentences: words.filter((e) => e.ownSentence).length,
    notes: words.reduce((n, e) => n + alive(e.notes).length, 0),
    sources: sources.size,
    metAgain: words.filter((e) => metEncounters(e).length >= 2).length,
    rareWords: words.filter((e) => isRare(e.word)).length,
    longestStreak: streaks(activityByDay(entries)).longest,
  }
}

export interface Achievement {
  id: string
  title: string
  description: string
  /** Progress towards the goal, capped at `goal`. */
  value: number
  goal: number
}

const goal = (id: string, title: string, description: string, value: number, target: number): Achievement => ({
  id,
  title,
  description,
  value: Math.min(value, target),
  goal: target,
})

export function achievements(s: Stats): Achievement[] {
  return [
    goal('first-word', 'First page', 'Add your first word', s.words, 1),
    goal('words-10', 'Ten words', 'Keep 10 words in your notebook', s.words, 10),
    goal('words-50', 'Fifty', 'Keep 50 words in your notebook', s.words, 50),
    goal('words-100', 'Century', 'Keep 100 words in your notebook', s.words, 100),
    goal('words-500', 'Full shelf', 'Keep 500 words in your notebook', s.words, 500),
    goal('streak-3', 'Three in a row', 'Be active 3 days in a row', s.longestStreak, 3),
    goal('streak-7', 'A full week', 'Be active 7 days in a row', s.longestStreak, 7),
    goal('streak-30', 'Habit', 'Be active 30 days in a row', s.longestStreak, 30),
    goal('use-1', 'Into the wild', 'Mark a word as “Use it”', s.inUse, 1),
    goal('use-25', 'Active vocabulary', 'Mark 25 words as “Use it”', s.inUse, 25),
    goal('sentences-5', 'Wordsmith', 'Write your own sentence for 5 words', s.sentences, 5),
    goal('met-again-5', 'Déjà vu', 'Meet 5 words again somewhere new', s.metAgain, 5),
    goal('sources-5', 'Wide reader', 'Collect words from 5 different sources', s.sources, 5),
    goal('notes-10', 'Scribbler', 'Write 10 notes', s.notes, 10),
    goal('rare-5', 'Deep cuts', 'Add 5 words beyond the 10,000 most common families', s.rareWords, 5),
  ]
}
