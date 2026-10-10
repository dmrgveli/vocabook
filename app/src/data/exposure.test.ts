import { describe, expect, it } from 'vitest'
import { exposureOf, exposureSummary } from './exposure'
import { withPracticeRecord } from './flashback'
import { createEncounter, createEntry, createNote, type Entry } from './model'

const word = (over: Partial<Entry> = {}): Entry => ({ ...createEntry({ word: 'thrive', encounter: createEncounter({ source: 'A show' }) }), ...over })

describe('exposure', () => {
  it('starts every new word at the first level', () => {
    expect(exposureOf(word())).toMatchObject({ points: 1, level: 1, views: 0, met: 1, practised: 0 })
    expect(exposureSummary(word())).toBe('Just added')
  })

  it('grows with looks, places, practice and what you write', () => {
    let e = word({ views: 4, translation: 'gelişmek' })
    expect(exposureOf(e).level).toBe(2) // 1 + 4 + 1
    e = { ...e, encounters: [...e.encounters, createEncounter({ source: 'A book', sentence: 'Plants thrive here.' })] }
    e = withPracticeRecord(withPracticeRecord(e, 'first-try'), 'came-back')
    e = { ...e, ownSentence: 'I thrive on deadlines.', notes: [createNote('like "flourish"')] }
    const x = exposureOf(e)
    // 1 + 4 views + 1 translation + 3 met again + 1 sentence + 3 + 2 practice + 4 own sentence + 2 note
    expect(x.points).toBe(21)
    expect(x.level).toBe(3)
    expect(exposureSummary(e, x)).toBe('Opened 4 times · met in 2 places · practised twice · your own sentence')
  })

  it('keeps the old self-rating as a head start and tops out at level five', () => {
    expect(exposureOf(word({ mastery: 'use' })).points).toBe(7)
    expect(exposureOf(word({ views: 60 }))).toMatchObject({ level: 5, progress: 1 })
  })
})
