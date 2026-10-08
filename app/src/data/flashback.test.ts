import { describe, expect, it } from 'vitest'
import {
  buildRound,
  cardFor,
  clampRoundSize,
  GAP,
  MAX_PRACTICE_RECORDS,
  pickFlashbackWords,
  practiceCount,
  shouldAskSize,
  withGap,
  withPracticeRecord,
} from './flashback'
import { alive, createEncounter, createEntry, metEncounters, type Entry } from './model'
import { allSources } from './notebook'

/** Small deterministic generator so rounds are reproducible in tests. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

function entry(word: string, over: Partial<Entry> = {}, sentence?: string): Entry {
  return { ...createEntry({ word, encounter: createEncounter({ source: 'A podcast', sentence }) }), ...over }
}

const withDefinition = (e: Entry, definition: string): Entry => ({
  ...e,
  enrichment: {
    fetchedAt: '',
    definitionsFrom: 'datamuse',
    meanings: [{ partOfSpeech: 'verb', definitions: [{ definition }] }],
    synonyms: [],
    antonyms: [],
    collocations: { before: [], after: [] },
  },
})

const notebook = [
  entry('thrive', { translation: 'gelişmek' }, 'Plants thrive in the sun.'),
  entry('grasp', { translation: 'kavramak' }),
  entry('nuance', { translation: 'ince fark' }),
  entry('linger', { translation: 'oyalanmak' }),
  entry('wholesome', { translation: 'sağlıklı' }),
  entry('bare'),
]

describe('withGap', () => {
  it('leaves out the word and its inflections', () => {
    expect(withGap('Plants thrive in the sun.', 'thrive')).toBe(`Plants ${GAP} in the sun.`)
    expect(withGap('She was thriving at work.', 'thrive')).toBe(`She was ${GAP} at work.`)
    expect(withGap('Nothing to see here.', 'thrive')).toBeUndefined()
  })
})

describe('cards', () => {
  it('offers four options with exactly one right answer', () => {
    for (const kind of ['moment', 'meaning', 'word'] as const) {
      const card = cardFor(notebook[0], notebook, kind, seeded(3))
      expect(card.kind).toBe(kind)
      expect(card.choices).toHaveLength(4)
      expect(card.choices.filter((c) => c.correct)).toHaveLength(1)
      expect(new Set(card.choices.map((c) => c.label)).size).toBe(4)
    }
    expect(cardFor(notebook[0], notebook, 'moment').prompt).toBe(`Plants ${GAP} in the sun.`)
  })

  it('keeps meaning options of one kind and hides the words in them', () => {
    const card = cardFor(notebook[1], notebook, 'word', seeded(5))
    expect(card.choices.map((c) => c.label).sort()).toEqual(
      expect.arrayContaining(['kavramak']),
    )
    expect(card.choices.every((c) => /^[a-zçğıöşü ]+$/i.test(c.label))).toBe(true) // all translations
    const defined = notebook.map((e, i) => withDefinition({ ...e, translation: undefined }, `To ${e.word} well, number ${i}.`))
    const byDefinition = cardFor(defined[0], defined, 'word', seeded(2))
    expect(byDefinition.choices.every((c) => c.label.startsWith('To … well'))).toBe(true)
  })

  it('falls back to a reveal card when there is nothing to ask', () => {
    expect(cardFor(notebook[5], notebook, 'meaning')).toMatchObject({ kind: 'word', choices: [] })
  })
})

describe('picking words', () => {
  it('prefers words that were in fewer rounds, at random', () => {
    const fresh = entry('fresh')
    const practiced = Array.from({ length: 3 }).reduce<Entry>((e) => withPracticeRecord(e, 'first-try'), entry('practiced'))
    expect(practiceCount(practiced)).toBe(3)
    let freshFirst = 0
    const random = seeded(7)
    for (let i = 0; i < 200; i++) if (pickFlashbackWords([fresh, practiced], 1, random)[0] === fresh) freshFirst++
    expect(freshFirst).toBeGreaterThan(170) // weight 1 vs 1/16
    expect(pickFlashbackWords([...notebook, { ...entry('gone'), deletedAt: 'x' }], 10)).toHaveLength(6)
  })

  it('builds rounds of the asked size', () => {
    expect(buildRound(notebook, 5, seeded(9))).toHaveLength(5)
    expect(clampRoundSize(15, 12)).toBe(12)
    expect(clampRoundSize(1, 12)).toBe(3)
    expect(shouldAskSize(10)).toBe(false)
    expect(shouldAskSize(11)).toBe(true)
  })
})

describe('practice records', () => {
  it('are on the timeline but not sources or real encounters', () => {
    const e = withPracticeRecord(notebook[0], 'came-back', 'My plants thrive now.')
    expect(alive(e.encounters)).toHaveLength(2)
    expect(metEncounters(e)).toHaveLength(1)
    expect(alive(e.encounters)[1]).toMatchObject({ source: 'Flashback · remembered the second time', sourceKind: 'flashback' })
    expect(allSources([e]).map((s) => s.source)).toEqual(['A podcast'])
  })

  it('keep only the latest few', () => {
    let e = notebook[1]
    for (let i = 0; i < MAX_PRACTICE_RECORDS + 3; i++) e = withPracticeRecord(e, 'first-try')
    expect(practiceCount(e)).toBe(MAX_PRACTICE_RECORDS)
    expect(e.encounters.filter((x) => x.deletedAt)).toHaveLength(3)
  })
})
