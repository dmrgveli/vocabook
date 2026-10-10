import { describe, expect, it } from 'vitest'
import { createEncounter, createEntry, type Entry } from './model'
import { pickReminderWords, REMINDER_MIN_WORDS, reminderHint } from './reminders'

const NOW = Date.parse('2026-10-20T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 864e5).toISOString()

function word(name: string, lastSeenDaysAgo: number, views = 0, extra: Partial<Entry> = {}): Entry {
  return {
    ...createEntry({ word: name, encounter: createEncounter({ source: 'Book' }) }),
    createdAt: daysAgo(30),
    lastViewedAt: daysAgo(lastSeenDaysAgo),
    views,
    ...extra,
  }
}

const filler = (n: number, lastSeen = 0.1) => Array.from({ length: n }, (_, i) => word(`fresh${i}`, lastSeen))

describe('pickReminderWords', () => {
  it(`waits until the notebook has ${REMINDER_MIN_WORDS} words`, () => {
    const few = [word('a', 10), word('b', 10), word('c', 10)]
    expect(pickReminderWords(few, NOW)).toBeUndefined()
    expect(pickReminderWords([...few, ...filler(REMINDER_MIN_WORDS - 3)], NOW)).toHaveLength(3)
  })

  it('skips words seen in the last day and needs at least three', () => {
    expect(pickReminderWords([word('a', 5), word('b', 5), ...filler(10)], NOW)).toBeUndefined()
  })

  it('prefers words unseen longest, weighted by exposure, at most five', () => {
    const list = [
      word('known-old', 20, 50), // old friend: 20 × 0.4 = 8
      word('new-ish', 10), // just met: 10
      word('middle', 10, 6), // crossed paths: 10 × 0.85 = 8.5
      word('oldest', 40), // 40
      word('a', 3),
      word('b', 2),
      word('c', 1.5),
      ...filler(5),
    ]
    const picked = pickReminderWords(list, NOW)!.map((e) => e.word)
    expect(picked).toEqual(['oldest', 'new-ish', 'middle', 'known-old', 'a'])
  })

  it('ignores deleted words', () => {
    const list = [word('gone', 50, 0, { deletedAt: daysAgo(1) }), word('a', 5), word('b', 5), word('c', 5), ...filler(10)]
    expect(pickReminderWords(list, NOW)!.map((e) => e.word)).not.toContain('gone')
  })
})

describe('reminderHint', () => {
  it('uses the translation, then the first definition', () => {
    expect(reminderHint(word('a', 1, 0, { translation: 'çeviri' }))).toBe('çeviri')
    const withDef = word('b', 1, 0, {
      enrichment: { meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'to grow' }] }] } as unknown as Entry['enrichment'],
    })
    expect(reminderHint(withDef)).toBe('to grow')
    expect(reminderHint(word('c', 1))).toBeUndefined()
  })
})
