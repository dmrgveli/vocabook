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
  commonSynonym,
  flashbackHistory,
  shortDefinition,
  simpleMeaning,
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
    const defined = notebook.map((e, i) => withDefinition({ ...e, translation: undefined }, `Meaning number ${i}, in short.`))
    const byDefinition = cardFor(defined[0], defined, 'word', seeded(2))
    expect(byDefinition.choices.every((c) => c.label.startsWith('Meaning number'))).toBe(true)
  })

  it('falls back to a reveal card when there is nothing to ask', () => {
    expect(cardFor(notebook[5], notebook, 'meaning')).toMatchObject({ kind: 'word', choices: [] })
  })
})

describe('simple meanings', () => {
  const rich = (definitions: string[], synonyms: string[] = []): Entry => ({
    ...entry('thrive'),
    enrichment: {
      fetchedAt: '',
      definitionsFrom: 'free-dictionary',
      meanings: [{ partOfSpeech: 'verb', definitions: definitions.map((definition) => ({ definition })) }],
      synonyms,
      antonyms: [],
      collocations: { before: [], after: [] },
    },
  })
  const long = 'To grow or develop well and vigorously, especially in a favourable environment over a long time.'

  it('picks the shortest of the first senses, without labels like (intransitive)', () => {
    expect(shortDefinition(rich([long, '(intransitive) To prosper; be fortunate.', 'To flourish.']))).toBe('To flourish.')
  })

  it('prefers the first part of speech and skips definitions that use the word', () => {
    const knee: Entry = {
      ...entry('knee'),
      enrichment: {
        fetchedAt: '',
        definitionsFrom: 'free-dictionary',
        meanings: [
          { partOfSpeech: 'noun', definitions: [{ definition: long }, { definition: 'The joint in the middle of the leg.' }] },
          { partOfSpeech: 'verb', definitions: [{ definition: 'To kneel to.' }] },
        ],
        synonyms: [],
        antonyms: [],
        collocations: { before: [], after: [] },
      },
    }
    expect(shortDefinition(knee)).toBe('The joint in the middle of the leg.')
  })

  it('falls back to the most common single-word synonym when every definition is long', () => {
    const e = rich([long], ['get ahead', 'flourish', 'boom', 'prosper'])
    expect(shortDefinition(e)).toBeUndefined()
    const k: Record<string, number> = { flourish: 8, boom: 4, prosper: 9 }
    expect(commonSynonym(e, (w) => k[w])).toBe('≈ boom')
    expect(cardFor(e, notebook, 'meaning', seeded(1), (w) => k[w]).prompt).toBe('≈ boom')
  })

  it('cuts the main definition short rather than use an obscure synonym', () => {
    const e = rich([long], ['stifle', 'genu'])
    const k: Record<string, number> = { stifle: 8 }
    expect(simpleMeaning(e, (w) => k[w])).toBe('To grow or develop well and vigorously, especially in a favourable…')
    expect(simpleMeaning(rich(['To grow well; to do better than expected over many long years.']), () => 1)).toBe('To grow well; to do better than expected over many long years.')
    expect(simpleMeaning(rich(['To grow and develop very well in every possible way; to do better than expected over many years.']))).toBe(
      'To grow and develop very well in every possible way',
    )
  })

  it('never puts long definitions in the options', () => {
    const k = () => 3
    const words = ['grasp', 'nuance', 'linger', 'wholesome', 'candid'].map((w, i) => ({
      ...rich([long + i], [`syn${i}`]),
      id: `id-${w}`,
      word: w,
    }))
    const card = cardFor(words[0], words, 'word', seeded(4), k)
    expect(card.kind).toBe('word')
    expect(card.choices.every((c) => c.label.startsWith('≈ syn'))).toBe(true)
  })
})

describe('cleaner options and phrase cards', () => {
  it('drops labels and definitions that describe the word instead of its meaning', () => {
    const e = (defs: string[]): Entry => ({
      ...entry('truck'),
      enrichment: {
        fetchedAt: '',
        definitionsFrom: 'datamuse',
        meanings: [{ partOfSpeech: 'noun', definitions: defs.map((definition) => ({ definition })) }],
        synonyms: [],
        antonyms: [],
        collocations: { before: [], after: [] },
      },
    })
    expect(shortDefinition(e(['(chiefly US, Canada) A heavy goods vehicle.']))).toBe('A heavy goods vehicle.')
    expect(shortDefinition(e(['US definition of a lorry.', 'Alternative form of lorry.', 'A large vehicle for goods.']))).toBe('A large vehicle for goods.')
  })

  it('asks for the missing word in a common phrase from the corpus', () => {
    const decision: Entry = {
      ...entry('decision'),
      enrichment: {
        fetchedAt: '',
        definitionsFrom: 'datamuse',
        meanings: [],
        synonyms: [],
        antonyms: [],
        collocations: { before: [], after: [] },
        corpus: {
          fetchedAt: '',
          pos: '-n',
          groups: [{ id: 'verbs-before', label: 'Verbs before', items: [{ word: 'make', phrase: 'make informed decisions' }] }],
          examples: [],
          similar: [],
        },
      },
    }
    const card = cardFor(decision, notebook, 'phrase', seeded(2))
    expect(card).toMatchObject({ kind: 'phrase', prompt: `make informed ${GAP}`, sentence: 'make informed decisions' })
    expect(card.choices.filter((c) => c.correct)).toEqual([{ label: 'decision', correct: true }])
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

describe('flashbackHistory', () => {
  it('groups records written together into rounds, newest first', () => {
    const at = (iso: string) => (e: Entry): Entry => ({
      ...e,
      encounters: e.encounters.map((x, i, all) => (i === all.length - 1 ? { ...x, createdAt: iso } : x)),
    })
    let [a, b, c] = notebook
    a = at('2026-10-01T10:00:00.000Z')(withPracticeRecord(a, 'first-try'))
    b = at('2026-10-01T10:00:00.050Z')(withPracticeRecord(b, 'still-learning'))
    a = at('2026-10-05T09:00:00.000Z')(withPracticeRecord(a, 'came-back'))
    c = at('2026-10-05T09:00:00.020Z')(withPracticeRecord(c, 'first-try'))
    const rounds = flashbackHistory([a, b, c])
    expect(rounds).toHaveLength(2)
    expect(rounds[0]).toMatchObject({ remembered: 2 })
    expect(rounds[0].words.map((w) => [w.entry.word, w.result])).toEqual([
      ['thrive', 'came-back'],
      ['nuance', 'first-try'],
    ])
    expect(rounds[1].words.map((w) => w.result)).toEqual(['first-try', 'still-learning'])
  })
})
