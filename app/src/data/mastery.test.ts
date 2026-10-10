import { describe, expect, it } from 'vitest'
import { afterRound, earnsKnowIt, withPracticeRecord, type RoundResult } from './flashback'
import { createEncounter, createEntry, type Entry } from './model'

const DAY = 864e5
const T0 = Date.parse('2026-10-05T10:00:00Z')

/** A Flashback record written `day` days after T0 (the record only: no level change). */
function round(entry: Entry, result: RoundResult, day: number): Entry {
  const next = withPracticeRecord(entry, result)
  const added = next.encounters[next.encounters.length - 1]
  const at = new Date(T0 + day * DAY).toISOString()
  return { ...next, encounters: [...next.encounters.slice(0, -1), { ...added, createdAt: at, updatedAt: at }] }
}

const word = (over: Partial<Entry> = {}): Entry => ({ ...createEntry({ word: 'thrive', encounter: createEncounter({ source: 'A show' }) }), ...over })

describe('Seen it → Know it', () => {
  it('needs the first try on two different days', () => {
    let e = round(word(), 'first-try', 0)
    expect(earnsKnowIt(e)).toBe(false)
    e = round(e, 'came-back', 1) // remembered, but not the first time
    expect(earnsKnowIt(e)).toBe(false)
    e = round(e, 'first-try', 3)
    expect(earnsKnowIt(e)).toBe(true)
  })

  it('does not count two rounds on the same day', () => {
    const e = round(round(word(), 'first-try', 0), 'first-try', 0.01)
    expect(earnsKnowIt(e)).toBe(false)
  })

  it('moves the word up as the round is written, never to Use it and never down', () => {
    const ready = round(word(), 'first-try', 0)
    // the second first-try record is written "now", a different day from T0
    expect(afterRound(ready, 'first-try').mastery).toBe('understand')
    expect(afterRound({ ...ready, mastery: 'understand' }, 'first-try').mastery).toBe('understand')
    expect(afterRound({ ...ready, mastery: 'use' }, 'still-learning').mastery).toBe('use')
  })

  it('ignores rounds from before the level was last set by hand', () => {
    let e = round(round(word(), 'first-try', 0), 'first-try', 1)
    e = { ...e, mastery: 'recognize', masteryAt: new Date(T0 + 2 * DAY).toISOString() }
    expect(earnsKnowIt(e)).toBe(false)
    e = round(round(e, 'first-try', 3), 'first-try', 4)
    expect(earnsKnowIt(e)).toBe(true)
  })
})
