import { describe, expect, it } from 'vitest'
import { groupOf, shapeComparison, shapeExamples, shapeGroups, shapeSimilar, tidy, type RawWord } from './corpus'

const raw = (rels: RawWord['rels'], pos = '-n'): RawWord => ({ lemma: 'decision', pos, rels, examples: [], similar: [] })

describe('tidy', () => {
  it('fixes the corpus token spacing', () => {
    expect(tidy('He did n\'t make it , did he ?')).toBe("He didn't make it, did he?")
    expect(tidy("the court 's decision ( final )")).toBe("the court's decision (final)")
  })
})

describe('groups', () => {
  it('maps relations to plain groups that depend on the part of speech', () => {
    expect(groupOf('modifiers of "%w"', '-n')).toBe('adjectives')
    expect(groupOf('modifiers of "%w"', '-v')).toBe('adverbs')
    expect(groupOf('... behind "%w"', '-n')).toBe('prepositions')
    expect(groupOf('"%w" about ...', '-n')).toBe('prepositions')
    expect(groupOf('verbs with particle "down" and "%w" as object', '-n')).toBe('phrasal')
    expect(groupOf('pronominal possessors of "%w"', '-n')).toBeUndefined()
  })

  it('keeps clean phrases, drops names, lists and numbers, merges prepositions by score', () => {
    const groups = shapeGroups(
      raw([
        {
          name: 'modifiers of "%w"',
          items: [
            { w: 'final', p: 'the final decision', s: 8 },
            { w: 'court', p: 'Supreme Court decision', s: 9 },
            { w: 'unanimous', p: 'a unanimous decision', s: 7 },
          ],
        },
        { name: 'verbs with "%w" as object', items: [{ w: 'make', p: 'make decisions', s: 9 }, { w: 'unanimous', p: 'a unanimous decision', s: 6 }] },
        { name: '... behind "%w"', items: [{ w: 'reasoning', p: 'reasoning behind the decision', s: 6 }] },
        { name: '"%w" about ...', items: [{ w: 'future', p: 'decisions about the future', s: 7 }] },
        { name: '"%w" and/or ...', items: [{ w: 'decision', p: 'Decisions , decisions', s: 9 }] },
        { name: '"%w" in ...', items: [{ w: 'case', p: 'decision in 2021', s: 5 }] },
      ]),
    )
    expect(groups.map((g) => [g.label, g.items.map((i) => i.phrase)])).toEqual([
      ['Adjectives', ['the final decision', 'a unanimous decision']],
      ['Verbs before', ['make decisions']],
      ['With prepositions', ['decisions about the future', 'reasoning behind the decision']],
    ])
  })
})

describe('examples and similar words', () => {
  it('keeps short, clean sentences and splits them around the word', () => {
    const ex = shapeExamples([
      { l: 'All you need is gravel and light for the plants to', k: 'thrive', r: '.' },
      { l: 'Click here www.example.com to', k: 'thrive', r: 'today !' },
      { l: 'too short', k: 'thrive', r: '.' },
      { l: 'Question 2: How do small businesses', k: 'thrive', r: 'in a crisis ?' },
      { l: 'THRIVE LEADS PLUGIN REVIEW AND', k: 'THRIVE', r: 'THEMES .' },
    ])
    expect(ex).toEqual([{ before: 'All you need is gravel and light for the plants to', word: 'thrive', after: '.' }])
  })

  it('cleans similar words', () => {
    expect(shapeSimilar([{ w: 'flourish', s: 0.4 }, { w: 'Global', s: 0.3 }, { w: 'thrive', s: 1 }, { w: 'prosper', s: 0.2 }], 'thrive')).toEqual([
      'flourish',
      'prosper',
    ])
  })
})

describe('comparison', () => {
  it('finds what sets two words apart and what they share', () => {
    const c = shapeComparison({
      a: 'big',
      b: 'large',
      rels: [
        {
          name: 'nouns modified by "%w"',
          rows: [
            { w: 'deal', a: 9, b: 3, ca: 5000, cb: 40 },
            { w: 'amount', a: 4, b: 10, ca: 300, cb: 9000 },
            { w: 'house', a: 8, b: 8.2, ca: 2000, cb: 2100 },
            { w: 'Bang', a: 9, b: 1, ca: 900, cb: 3 },
            { w: 'painpoint', a: 9, b: 0, ca: 12, cb: 0 },
          ],
        },
      ],
    })
    expect(c).toEqual({ a: 'big', b: 'large', onlyA: ['deal'], onlyB: ['amount'], both: ['house'] })
  })
})
