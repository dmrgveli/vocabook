import { describe, expect, it } from 'vitest'
import { createEncounter, createEntry, createNote, type Entry } from '../data/model'
import { changedLocally, mergeNotebooks, pruneTombstones, stableStringify, toWire, wireNotebook } from './merge'

const at = (iso: string) => `2026-10-0${iso}T00:00:00.000Z`

function entry(word: string, over: Partial<Entry> = {}): Entry {
  return { ...createEntry({ word, encounter: createEncounter({ source: 'Book' }) }), createdAt: at('1'), updatedAt: at('1'), ...over }
}

describe('mergeNotebooks', () => {
  it('unions entries from both sides', () => {
    const a = entry('grasp')
    const b = entry('thrive')
    expect(mergeNotebooks([a], [b]).map((e) => e.word).sort()).toEqual(['grasp', 'thrive'])
  })

  it('takes the newer copy of an entry but merges encounters and notes from both', () => {
    const base = entry('grasp')
    const local = { ...base, translation: 'kavramak', updatedAt: at('3'), notes: [createNote('local note')] }
    const remoteEnc = { ...createEncounter({ source: 'Podcast' }), updatedAt: at('2') }
    const remote = { ...base, mastery: 'use' as const, updatedAt: at('2'), encounters: [...base.encounters, remoteEnc] }
    const [merged] = mergeNotebooks([local], [remote])
    expect(merged.translation).toBe('kavramak') // local is newer
    expect(merged.mastery).toBe('recognize') // so its fields win
    expect(merged.encounters.map((e) => e.source).sort()).toEqual(['Book', 'Podcast'])
    expect(merged.notes.map((n) => n.text)).toEqual(['local note'])
  })

  it('lets a newer deletion win', () => {
    const base = entry('grasp')
    const deleted = { ...base, deletedAt: at('5'), updatedAt: at('5') }
    expect(mergeNotebooks([base], [deleted])[0].deletedAt).toBe(at('5'))
    expect(mergeNotebooks([deleted], [base])[0].deletedAt).toBe(at('5'))
  })

  it('keeps this device’s dictionary cache', () => {
    const base = entry('grasp')
    const local = { ...base, enrichment: { fetchedAt: at('1') } as Entry['enrichment'] }
    const remote = { ...base, updatedAt: at('4'), translation: 'anlamak' }
    const [merged] = mergeNotebooks([local], [remote])
    expect(merged.translation).toBe('anlamak')
    expect(merged.enrichment).toEqual(local.enrichment)
  })

  it('folds the same word added on two devices into the oldest entry', () => {
    const first = entry('grasp', { createdAt: at('1'), translation: 'kavramak' })
    const second = entry('grasp', { createdAt: at('2'), mastery: 'use', tags: ['work'] })
    const merged = mergeNotebooks([first], [second])
    const keep = merged.find((e) => e.id === first.id)!
    const gone = merged.find((e) => e.id === second.id)!
    expect(keep.deletedAt).toBeUndefined()
    expect(keep.translation).toBe('kavramak')
    expect(keep.mastery).toBe('use')
    expect(keep.tags).toEqual(['work'])
    expect(keep.encounters).toHaveLength(2)
    expect(gone.deletedAt).toBeDefined()
  })
})

describe('wire format', () => {
  it('drops the dictionary cache and shrinks tombstones', () => {
    const e = { ...entry('grasp'), enrichment: { fetchedAt: at('1') } as Entry['enrichment'], translation: 'x' }
    expect('enrichment' in toWire(e)).toBe(false)
    const tomb = toWire({ ...e, deletedAt: at('2') })
    expect(tomb.translation).toBeUndefined()
    expect(tomb.encounters).toEqual([])
  })

  it('is stable regardless of order', () => {
    const a = entry('a')
    const b = entry('b')
    expect(stableStringify(wireNotebook([a, b]))).toBe(stableStringify(wireNotebook([b, a])))
    expect(stableStringify({ x: 1, y: { b: 2, a: 1 } })).toBe(stableStringify({ y: { a: 1, b: 2 }, x: 1 }))
  })

  it('reports only entries that actually changed', () => {
    const a = entry('a')
    const b = entry('b')
    const merged = mergeNotebooks([a, b], [{ ...b, updatedAt: at('3'), translation: 'new' }])
    expect(changedLocally([a, b], merged).map((e) => e.word)).toEqual(['b'])
  })
})

describe('pruneTombstones', () => {
  const day = 86_400_000
  const nowMs = Date.parse('2026-12-31T00:00:00.000Z')
  const ago = (days: number) => new Date(nowMs - days * day).toISOString()

  it('drops deletions older than the cutoff and keeps recent ones', () => {
    const old = entry('grasp', { deletedAt: ago(61), updatedAt: ago(61) })
    const recent = entry('thrive', { deletedAt: ago(10), updatedAt: ago(10) })
    const alive = entry('nuance')
    const { entries, purged } = pruneTombstones([old, recent, alive], nowMs)
    expect(purged).toEqual([old.id])
    expect(entries.map((e) => e.word)).toEqual(['thrive', 'nuance'])
  })

  it('drops old deleted encounters and notes inside living entries, untouched entries stay the same object', () => {
    const e = entry('grasp')
    const goneEnc = { ...createEncounter({ source: 'Old' }), deletedAt: ago(90) }
    const goneNote = { ...createNote('old'), deletedAt: ago(90) }
    const keptNote = { ...createNote('fresh'), deletedAt: ago(5) }
    const withTombs = { ...e, encounters: [...e.encounters, goneEnc], notes: [goneNote, keptNote] }
    const untouched = entry('thrive')
    const { entries } = pruneTombstones([withTombs, untouched], nowMs)
    expect(entries[0].encounters.map((x) => x.source)).toEqual(['Book'])
    expect(entries[0].notes.map((n) => n.text)).toEqual(['fresh'])
    expect(entries[1]).toBe(untouched)
  })
})
