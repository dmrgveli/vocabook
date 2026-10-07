import { describe, expect, it } from 'vitest'
import { parseWordParam, wordPath } from './paths'

describe('word paths', () => {
  it('uses the word itself, with + for spaces', () => {
    expect(wordPath('thrive')).toBe('/word/thrive')
    expect(wordPath('look for')).toBe('/word/look+for')
    expect(wordPath("don't")).toBe("/word/don't")
  })

  it('reads words back, normalized', () => {
    expect(parseWordParam('thrive')).toEqual({ word: 'thrive' })
    expect(parseWordParam('look+for')).toEqual({ word: 'look for' })
    expect(parseWordParam('Thrive')).toEqual({ word: 'thrive' })
  })

  it('still understands old id links', () => {
    expect(parseWordParam('37a1170c-6ad1-47da-b385-4c0a7115b543')).toEqual({ id: '37a1170c-6ad1-47da-b385-4c0a7115b543' })
  })
})
