import { describe, expect, it } from 'vitest'
import { createEncounter, createEntry, type Entry, type Mastery } from './model'
import { groupEntries, sortEntries } from './notebook'

function word(w: string, created: string, opts: { mastery?: Mastery; source?: string; seen?: string } = {}): Entry {
  return {
    ...createEntry({ word: w, encounter: createEncounter({ source: opts.source ?? 'Book' }) }),
    createdAt: created,
    mastery: opts.mastery ?? 'recognize',
    lastViewedAt: opts.seen,
  }
}

const levels: Record<string, number> = { get: 1, grasp: 3, thrive: 4, nuance: 7 }
const levelOf = (w: string) => levels[w]
const bandOf = (w: string) => (levels[w] === undefined ? undefined : levels[w] <= 1 ? 'k1' : levels[w] <= 3 ? 'k3' : levels[w] <= 5 ? 'k5' : 'k10')

const a = word('thrive', '2026-10-01T10:00:00Z', { mastery: 'use', source: 'Show', seen: '2026-10-07T10:00:00Z' })
const b = word('grasp', '2026-10-03T10:00:00Z', { mastery: 'understand', source: 'Book', seen: '2026-10-02T10:00:00Z' })
const c = word('nuance', '2026-10-03T12:00:00Z', { mastery: 'recognize', source: 'Show' })
const d = word('hashtag', '2026-09-20T10:00:00Z', { mastery: 'recognize', source: 'Podcast' })
const all = [a, b, c, d]
const words = (list: Entry[]) => list.map((e) => e.word)

describe('sortEntries', () => {
  it('sorts by date and alphabet', () => {
    expect(words(sortEntries(all, 'newest', levelOf))).toEqual(['nuance', 'grasp', 'thrive', 'hashtag'])
    expect(words(sortEntries(all, 'oldest', levelOf))).toEqual(['hashtag', 'thrive', 'grasp', 'nuance'])
    expect(words(sortEntries(all, 'az', levelOf))).toEqual(['grasp', 'hashtag', 'nuance', 'thrive'])
  })

  it('sorts by level, with words off the lists last when most common first', () => {
    expect(words(sortEntries(all, 'common', levelOf))).toEqual(['grasp', 'thrive', 'nuance', 'hashtag'])
    expect(words(sortEntries(all, 'rare', levelOf))).toEqual(['hashtag', 'nuance', 'thrive', 'grasp'])
  })

  it('puts the least known and the longest unseen first', () => {
    expect(words(sortEntries(all, 'least-known', levelOf))).toEqual(['hashtag', 'nuance', 'grasp', 'thrive'])
    expect(words(sortEntries(all, 'unseen', levelOf))).toEqual(['hashtag', 'grasp', 'nuance', 'thrive'])
  })
})

describe('groupEntries', () => {
  it('groups by day, newest day first, keeping the sort inside', () => {
    const groups = groupEntries(sortEntries(all, 'az', levelOf), 'day', bandOf)
    expect(groups.map((g) => [g.key, words(g.entries)])).toEqual([
      ['2026-10-03', ['grasp', 'nuance']],
      ['2026-10-01', ['thrive']],
      ['2026-09-20', ['hashtag']],
    ])
  })

  it('groups by source, level band and mastery in a natural order', () => {
    const sorted = sortEntries(all, 'newest', levelOf)
    expect(groupEntries(sorted, 'source', bandOf).map((g) => g.key)).toEqual(['Show', 'Book', 'Podcast'])
    expect(groupEntries(sorted, 'level', bandOf).map((g) => g.key)).toEqual(['k3', 'k5', 'k10', 'unknown'])
    expect(groupEntries(sorted, 'mastery', bandOf).map((g) => g.key)).toEqual(['recognize', 'understand', 'use'])
    expect(groupEntries(sorted, 'none', bandOf)).toEqual([{ key: 'all', entries: sorted }])
  })
})
