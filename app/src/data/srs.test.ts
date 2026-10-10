import { describe, expect, it } from 'vitest'
import { createEncounter, createEntry, type Entry } from './model'
import { RESULT_LABEL, type RoundResult } from './flashback'
import { dueEntries, nextDue, scheduleOf, whenLabel } from './srs'

const DAY = 864e5
const T0 = Date.parse('2026-10-01T09:00:00Z')

function word(w: string, reviews: [number, RoundResult][] = [], mastery: Entry['mastery'] = 'recognize'): Entry {
  const e = { ...createEntry({ word: w, encounter: createEncounter({ source: 'Book' }) }), createdAt: new Date(T0).toISOString(), mastery }
  const practice = reviews.map(([day, r]) => ({
    ...createEncounter({ source: `Flashback · ${RESULT_LABEL[r]}`, sourceKind: 'flashback' as const }),
    createdAt: new Date(T0 + day * DAY).toISOString(),
  }))
  return { ...e, encounters: [...e.encounters, ...practice] }
}

describe('scheduleOf', () => {
  it('asks a new word the next day, later if you already use it', () => {
    expect(scheduleOf(word('a')).due).toBe(T0 + DAY)
    expect(scheduleOf(word('a', [], 'use')).due).toBe(T0 + 4 * DAY)
  })

  it('grows the gap with each remembered review: 1, 3, then × ease', () => {
    const s = scheduleOf(word('a', [[1, 'first-try'], [2, 'first-try'], [5, 'first-try']]))
    expect(s.interval).toBe(Math.round(3 * 2.4))
    expect(s.due).toBe(T0 + (5 + s.interval) * DAY)
  })

  it('starts again tomorrow after a miss, and lowers the ease', () => {
    const s = scheduleOf(word('a', [[1, 'first-try'], [2, 'first-try'], [5, 'still-learning']]))
    expect(s.interval).toBe(1)
    expect(s.lapses).toBe(1)
    expect(s.ease).toBeLessThan(2.3)
  })

  it('does not stretch the gap when practised long before it is due', () => {
    const s = scheduleOf(word('a', [[1, 'first-try'], [2, 'first-try'], [2.1, 'first-try']]))
    expect(s.interval).toBe(3)
  })
})

describe('due lists', () => {
  it('lists due words, most overdue first, and tells when the next ones come', () => {
    const now = T0 + 10 * DAY
    const fresh = word('fresh', [[9, 'first-try'], [9.9, 'first-try']])
    const late = word('late', [[1, 'first-try']])
    const later = word('later', [[1, 'first-try'], [2, 'first-try']])
    expect(dueEntries([fresh, late, later], now).map((e) => e.word)).toEqual(['late', 'later'])
    expect(nextDue([fresh], now)?.count).toBe(1)
    expect(whenLabel(now + DAY, now)).toBe('tomorrow')
    expect(whenLabel(now + 21 * DAY, now)).toBe('in 3 weeks')
  })
})
