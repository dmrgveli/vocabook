import { describe, expect, it } from 'vitest'
import { bandOf, buildTable, describeLevel, formatLevel, levelOf } from './levels'

// A tiny table in the format of public/bnc-coca-levels.json.
const lookup = buildTable({
  levels: [
    'go goes going gonna went;look looked looking looks;for;sun suns;flower flowers', // 1K
    'decide decided;decision decisions', // 2K
    '',
    'thrive thrived thrives thriving', // 4K
    '',
    'meticulous meticulously', // 6K
  ],
  compounds: 'sunflower sunflowers',
})

describe('levelOf', () => {
  it('finds a word and its family', () => {
    expect(levelOf('thrive', lookup)).toEqual({ level: 4, family: undefined })
    expect(levelOf('Thriving', lookup)).toEqual({ level: 4, family: 'thrive' })
    expect(levelOf('gonna', lookup)).toEqual({ level: 1, family: 'go' })
  })

  it('gives phrases and transparent compounds the level of their hardest part', () => {
    expect(levelOf('look for', lookup)).toEqual({ level: 1 })
    expect(levelOf('sunflowers', lookup)).toEqual({ level: 1 })
    expect(levelOf('meticulous decision', lookup)).toEqual({ level: 6 })
  })

  it('marks words outside the lists', () => {
    expect(levelOf('hashtag', lookup)).toEqual({ level: 'off' })
    expect(levelOf('look hashtag', lookup)).toEqual({ level: 'off' })
  })

  it('is undefined until the table has loaded', () => {
    expect(levelOf('go', undefined)).toBeUndefined()
  })
})

describe('labels and bands', () => {
  it('formats levels', () => {
    expect(formatLevel({ level: 4 })).toBe('4K')
    expect(formatLevel({ level: 'off' })).toBe('25K+')
    expect(describeLevel({ level: 4 })).toBe('Among the 4,000 most common word families')
    expect(describeLevel({ level: 'off' })).toBe('Not among the 25,000 most common word families')
  })

  it('groups levels into colour bands', () => {
    expect(bandOf({ level: 1 })).toBe('k1')
    expect(bandOf({ level: 3 })).toBe('k3')
    expect(bandOf({ level: 6 })).toBe('k10')
    expect(bandOf({ level: 21 })).toBe('rare')
    expect(bandOf({ level: 'off' })).toBe('rare')
    expect(bandOf(undefined)).toBeUndefined()
  })
})

describe('the shipped BNC/COCA table', async () => {
  const { readFileSync } = await import('node:fs')
  const data = JSON.parse(readFileSync(new URL('../../public/bnc-coca-levels.json', import.meta.url), 'utf8'))
  const real = buildTable(data)

  it('has 25 lists of 1,000 families', () => {
    expect(data.levels).toHaveLength(25)
    for (const list of data.levels) expect(list.split(';')).toHaveLength(1000)
    expect(data.license).toBe('CC BY-SA 4.0')
  })

  it('places known words where Nation does', () => {
    const level = (w: string) => levelOf(w, real)?.level
    expect(level('get')).toBe(1)
    expect(level('gonna')).toBe(1)
    expect(level('decision')).toBe(2)
    expect(level('grasp')).toBe(3)
    expect(level('thriving')).toBe(4)
    expect(level('meticulous')).toBe(6)
    expect(level('nuance')).toBe(7)
    expect(level('ubiquitous')).toBe(10)
    expect(level('café')).toBe(levelOf('cafe', real)?.level)
    expect(level('look for')).toBe(1)
  })
})
