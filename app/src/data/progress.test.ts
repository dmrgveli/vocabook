import { describe, expect, it } from 'vitest'
import { createEncounter, createEntry, createNote, type Entry } from './model'
import { localDay } from './notebook'
import { achievements, activityByDay, heatmap, stats, streaks } from './progress'

const day = (offset: number, base = '2026-10-08') => {
  const d = new Date(`${base}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return localDay(d.toISOString())
}
const set = (...offsets: number[]) => new Set(offsets.map((o) => day(o)))

describe('streaks', () => {
  const today = day(0)
  it('counts back from today', () => {
    expect(streaks(set(0, -1, -2, -5), today)).toEqual({ current: 3, longest: 3, activeToday: true })
  })
  it('keeps yesterday’s streak alive until today is over', () => {
    expect(streaks(set(-1, -2), today)).toEqual({ current: 2, longest: 2, activeToday: false })
  })
  it('ends after a full day without activity but remembers the longest run', () => {
    expect(streaks(set(-2, -3, -10, -11, -12, -13), today)).toEqual({ current: 0, longest: 4, activeToday: false })
  })
})

describe('activity', () => {
  it('counts adding, new encounters, notes and revisits by day', () => {
    const e: Entry = {
      ...createEntry({ word: 'thrive', encounter: createEncounter({ source: 'Book' }) }),
      createdAt: `${day(-3)}T10:00:00`,
      lastViewedAt: `${day(0)}T10:00:00`,
    }
    e.encounters = [{ ...e.encounters[0], createdAt: e.createdAt }, { ...createEncounter({ source: 'Show' }), createdAt: `${day(-1)}T10:00:00` }]
    e.notes = [{ ...createNote('x'), createdAt: `${day(-1)}T11:00:00` }]
    const a = activityByDay([e])
    expect([...a.entries()].sort()).toEqual([
      [day(-3), 1],
      [day(-1), 2],
      [day(0), 1],
    ])
  })

  it('lays out a Monday-first heatmap ending this week', () => {
    const cols = heatmap(new Map([[day(0), 2]]), 2, new Date(`${day(0)}T12:00:00`))
    expect(cols).toHaveLength(2)
    expect(cols.every((c) => c.length === 7)).toBe(true)
    expect(new Date(`${cols[0][0].day}T12:00:00`).getDay()).toBe(1) // Monday
    expect(cols.flat().find((c) => c.day === day(0))?.count).toBe(2)
    expect(cols.flat().filter((c) => c.future).every((c) => c.day > day(0))).toBe(true)
  })
})

describe('achievements', () => {
  it('reports progress capped at the goal', () => {
    const words = Array.from({ length: 12 }, (_, i) => ({ ...createEntry({ word: `w${i}` }), views: i < 2 ? 50 : 0 }))
    const list = achievements(stats(words, (w) => w === 'w0'))
    const byId = Object.fromEntries(list.map((a) => [a.id, a]))
    expect(byId['first-word']).toMatchObject({ value: 1, goal: 1 })
    expect(byId['use-1']).toMatchObject({ value: 1, goal: 1 })
    expect(byId['rare-5']).toMatchObject({ value: 1, goal: 5 })
    expect(byId['flashback-10']).toMatchObject({ value: 0, goal: 10 })
    expect(list.some((a) => a.id.startsWith('words-'))).toBe(false)
  })

  it('counts the creative ones', () => {
    const met = (word: string, places: string[], over: Partial<Entry> = {}): Entry => {
      const e = createEntry({ word, encounter: createEncounter({ source: places[0] }) })
      return { ...e, encounters: [...e.encounters, ...places.slice(1).map((source) => createEncounter({ source }))], ...over }
    }
    const lateNight = new Date()
    lateNight.setHours(2, 30, 0, 0)
    const s = stats(
      [
        met('linger', ['A show', 'a show ', 'Work', 'A book']),
        met('look forward to', ['A podcast']),
        met('serendipitous', ['A book'], { createdAt: lateNight.toISOString() }),
      ],
      () => false,
    )
    expect(s).toMatchObject({ mostPlacesForOneWord: 3, phrases: 1, longWords: 1, lateNightWords: 1 })
  })
})
