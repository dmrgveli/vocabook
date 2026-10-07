import { describe, expect, it } from 'vitest'
import { parseDefinitions, parseFrequency } from '../api/datamuse'
import { parseDictionary, type FDEntry } from '../api/dictionary'
import { estimateRank, formatK, frequencyK, kBand, MAX_K } from './frequency'
import { createEncounter, createEntry, createNote, firstEncounter, now } from './model'
import { allSources, filterEntries, groupByDay, localDay } from './notebook'

describe('frequency ranks', () => {
  it('estimates the thousand a word falls in', () => {
    expect(frequencyK(292)).toBe(1) // get
    expect(frequencyK(28.97)).toBe(3) // decide
    expect(frequencyK(11.37)).toBe(6) // grasp
    expect(frequencyK(2.79)).toBe(14) // thrive
    expect(frequencyK(0.68)).toBe(26) // nuance
    expect(frequencyK(0.01)).toBe(MAX_K + 1)
    expect(frequencyK(undefined)).toBeUndefined()
    expect(frequencyK(0)).toBeUndefined()
  })

  it('hits the calibration points exactly and is monotonic', () => {
    expect(estimateRank(22)).toBe(3000)
    expect(estimateRank(4.51)).toBe(10000)
    let previous = 0
    for (let f = 500; f > 0.05; f *= 0.9) {
      const r = estimateRank(f)
      expect(r).toBeGreaterThanOrEqual(previous)
      previous = r
    }
  })

  it('formats and groups', () => {
    expect(formatK(4)).toBe('4K')
    expect(formatK(MAX_K + 1)).toBe('40K+')
    expect(kBand(292)).toBe('k1')
    expect(kBand(11.37)).toBe('k10')
    expect(kBand(0.68)).toBe('rare')
  })
})

describe('datamuse parsing', () => {
  it('reads the frequency tag', () => {
    expect(parseFrequency({ word: 'thrive', tags: ['pron:TH R AY1 V ', 'f:2.792939'] })).toBeCloseTo(2.79)
    expect(parseFrequency({ word: 'x' })).toBeUndefined()
  })

  it('groups definitions by part of speech', () => {
    const meanings = parseDefinitions(['v\t(intransitive) To prosper. ', 'v\tTo grow vigorously.', 'n\tA thing.'])
    expect(meanings).toEqual([
      { partOfSpeech: 'verb', definitions: [{ definition: '(intransitive) To prosper.' }, { definition: 'To grow vigorously.' }] },
      { partOfSpeech: 'noun', definitions: [{ definition: 'A thing.' }] },
    ])
  })
})

describe('free dictionary parsing', () => {
  const fixture: FDEntry[] = [
    {
      word: 'thrive',
      phonetic: '/θɹaɪv/',
      phonetics: [{ text: '/θɹaɪv/', audio: '' }, { audio: 'https://example.test/thrive-uk.mp3' }, { audio: 'https://example.test/thrive-us.mp3' }],
      meanings: [
        {
          partOfSpeech: 'verb',
          definitions: [{ definition: 'To grow well.', example: 'Plants thrive here.', synonyms: ['flourish'] }],
          synonyms: ['prosper', 'flourish'],
          antonyms: ['wither'],
        },
      ],
    },
    { word: 'thrive', meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To prosper.' }] }] },
  ]

  it('merges entries, prefers US audio and dedupes related words', () => {
    const r = parseDictionary(fixture)
    expect(r.phonetic).toBe('/θɹaɪv/')
    expect(r.audioUrl).toBe('https://example.test/thrive-us.mp3')
    expect(r.meanings).toEqual([
      { partOfSpeech: 'verb', definitions: [{ definition: 'To grow well.', example: 'Plants thrive here.' }, { definition: 'To prosper.', example: undefined }] },
    ])
    expect(r.synonyms).toEqual(['flourish', 'prosper'])
    expect(r.antonyms).toEqual(['wither'])
  })
})

describe('notebook', () => {
  const a = createEntry({ word: 'Grasp ', frequency: 11, translation: 'KAVRAMAK', encounter: createEncounter({ source: 'Book' }) })
  const b = createEntry({ word: 'thrive', frequency: 2.8, encounter: createEncounter({ source: 'Show', sentence: 'They thrive.' }) })
  b.tags = ['work']
  b.notes = [{ ...createNote('flourish'), deletedAt: now() }]

  it('normalizes the word on create', () => {
    expect(a.word).toBe('grasp')
    expect(a.mastery).toBe('recognize')
  })

  it('filters by query, frequency band and source', () => {
    expect(filterEntries([a, b], { query: 'kavra' })).toEqual([a])
    expect(filterEntries([a, b], { query: '', band: 'k20' })).toEqual([b])
    expect(filterEntries([a, b], { query: '', source: 'Book' })).toEqual([a])
  })

  it('ignores deleted notes in search', () => {
    expect(filterEntries([a, b], { query: 'flourish' })).toEqual([])
  })

  it('groups by local day, newest first', () => {
    const old = { ...a, createdAt: '2026-01-02T10:00:00.000Z' }
    const groups = groupByDay([old, b])
    expect(groups.map((g) => g.day)).toEqual([localDay(b.createdAt), localDay(old.createdAt)])
  })

  it('lists sources with counts', () => {
    const later = { ...createEncounter({ source: 'Podcast', date: '2030-01-01' }), createdAt: '2999-01-01T00:00:00Z' }
    const c = { ...a, encounters: [...a.encounters, later] }
    expect(allSources([c, b])[0]).toEqual({ source: 'Podcast', count: 1 })
    expect(firstEncounter(c)?.source).toBe('Book')
  })
})
