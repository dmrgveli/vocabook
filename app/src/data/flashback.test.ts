import { describe, expect, it } from 'vitest'
import { buildRound, cardFor, checkAnswer, GAP, hintFor, pickFlashbackWords, withGap } from './flashback'
import { createEncounter, createEntry, type Entry } from './model'

const DAY = 864e5
const NOW = Date.parse('2026-10-20T12:00:00Z')

function entry(word: string, over: Partial<Entry> = {}, sentence?: string): Entry {
  return { ...createEntry({ word, encounter: createEncounter({ source: 'A podcast', sentence }) }), ...over }
}

describe('withGap', () => {
  it('leaves out the word and its inflections', () => {
    expect(withGap('Plants thrive in the sun.', 'thrive')).toBe(`Plants ${GAP} in the sun.`)
    expect(withGap('She was thriving at work.', 'thrive')).toBe(`She was ${GAP} at work.`)
    expect(withGap('Grasping the idea took time.', 'grasp')).toBe(`${GAP} the idea took time.`)
    expect(withGap('Nothing to see here.', 'thrive')).toBeUndefined()
  })
})

describe('checkAnswer', () => {
  it('accepts the word and its forms, calls typos close', () => {
    expect(checkAnswer(' Thrive ', 'thrive')).toBe('right')
    expect(checkAnswer('thriving', 'thrive')).toBe('right')
    expect(checkAnswer('thirve', 'thrive')).toBe('close')
    expect(checkAnswer('meticulus', 'meticulous')).toBe('close')
    expect(checkAnswer('grow', 'thrive')).toBe('wrong')
    expect(checkAnswer('', 'thrive')).toBe('wrong')
  })
})

describe('cards', () => {
  it('uses the encounter sentence, then the translation or definition, then the word', () => {
    expect(cardFor(entry('thrive', {}, 'Plants thrive here.')).kind).toBe('moment')
    const meaning = cardFor(entry('thrive', { translation: 'gelişmek' }))
    expect(meaning).toMatchObject({ kind: 'meaning', prompt: 'gelişmek', source: 'A podcast' })
    expect(cardFor(entry('thrive')).kind).toBe('word')
    expect(cardFor(entry('thrive', { translation: 'x' }, 'Plants thrive.'), 'meaning').kind).toBe('meaning')
  })

  it('never gives the word away in a clue', () => {
    const e = entry('thrive', {
      enrichment: {
        fetchedAt: '',
        definitionsFrom: 'datamuse',
        meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To thrive; to grow well.' }] }],
        synonyms: [],
        antonyms: [],
        collocations: { before: [], after: [] },
      },
    })
    expect(cardFor(e, 'meaning').prompt).toBe('To …; to grow well.')
  })

  it('picks the words left alone longest, and those known less well first', () => {
    const ago = (d: number) => new Date(NOW - d * DAY).toISOString()
    const fresh = entry('fresh', { lastViewedAt: ago(0) })
    const oldKnown = entry('known', { lastViewedAt: ago(10), mastery: 'use' })
    const oldNew = entry('seen', { lastViewedAt: ago(10), mastery: 'recognize' })
    const deleted = entry('gone', { lastViewedAt: ago(99), deletedAt: ago(1) })
    expect(pickFlashbackWords([fresh, oldKnown, oldNew, deleted], NOW).map((e) => e.word)).toEqual(['seen', 'known', 'fresh'])
    expect(buildRound([fresh, oldKnown, oldNew], NOW, 2)).toHaveLength(2)
  })

  it('hints with the first letter and the length', () => {
    expect(hintFor('thrive')).toBe('t _ _ _ _ _')
    expect(hintFor('look for')).toBe('l _ _ _   _ _ _')
  })
})
