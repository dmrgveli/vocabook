import { alive, type Entry, type Mastery } from './model'

// Flashback: a short round with your own words, back in the moment you met them.
//
// Retrieval practice (recalling beats re-reading) with the notebook's own context:
//  - moment:  your encounter sentence with the word left out → recall the word
//  - meaning: your translation or a definition → recall the word
//  - word:    the word → recall what it means
// Words you didn't remember come back once at the end of the round. Nothing is
// scored or stored apart from "looked at" (lastViewedAt), which rests the word.

export const FLASHBACK_MIN_WORDS = 3
export const FLASHBACK_SIZE = 8

export type CardKind = 'moment' | 'meaning' | 'word'

export interface FlashCard {
  entry: Entry
  kind: CardKind
  /** moment: the sentence with a gap; meaning: the clue; word: the word */
  prompt: string
  /** where the sentence or the word came from */
  source?: string
}

/** Words you know less well come back sooner (same idea as the reminder pop-up). */
const MASTERY_WEIGHT: Record<Mastery, number> = { recognize: 1, understand: 0.7, use: 0.4 }
const DAY = 864e5
export const GAP = '_____'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The word and its inflections ("thrive" → thrives, thrived, thriving). */
function wordPattern(word: string): RegExp {
  // drop a final e so "thriving" matches too
  const stem = word.length > 3 && word.endsWith('e') ? word.slice(0, -1) : word
  return new RegExp(`\\b${escape(stem)}\\w*`, 'gi')
}

/** The sentence with the word left out; undefined when the word is not in it. */
export function withGap(sentence: string, word: string): string | undefined {
  const pattern = wordPattern(word)
  return pattern.test(sentence) ? sentence.replace(wordPattern(word), GAP) : undefined
}

/** A clue must not give the answer away: the word itself becomes "…". */
const hideWord = (text: string, word: string) => text.replace(wordPattern(word), '…')

export function clueFor(entry: Entry): string | undefined {
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  const clue = entry.translation ?? definition
  return clue && hideWord(clue, entry.word)
}

/** Picks the words for a round: least recently looked at first, weighted by mastery. */
export function pickFlashbackWords(entries: Entry[], now = Date.now(), size = FLASHBACK_SIZE): Entry[] {
  return entries
    .filter((e) => !e.deletedAt)
    .map((e) => ({ e, score: ((now - Date.parse(e.lastViewedAt ?? e.createdAt)) / DAY + 0.01) * MASTERY_WEIGHT[e.mastery] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map((x) => x.e)
}

/** The card for a word. `prefer` varies the kind across a round when a word allows several. */
export function cardFor(entry: Entry, prefer: CardKind = 'moment'): FlashCard {
  const moments = alive(entry.encounters)
    .filter((enc) => enc.sentence && withGap(enc.sentence, entry.word))
    .map((enc) => ({ prompt: withGap(enc.sentence!, entry.word)!, source: enc.source }))
  const clue = clueFor(entry)
  const firstSource = [...alive(entry.encounters)].sort((a, b) => a.date.localeCompare(b.date))[0]?.source

  const options: FlashCard[] = []
  if (moments.length) options.push({ entry, kind: 'moment', ...moments[moments.length - 1] })
  if (clue) options.push({ entry, kind: 'meaning', prompt: clue, source: firstSource })
  options.push({ entry, kind: 'word', prompt: entry.word, source: firstSource })
  return options.find((o) => o.kind === prefer) ?? options[0]
}

/** A round: one card per word, kinds alternating where the word allows it. */
export function buildRound(entries: Entry[], now = Date.now(), size = FLASHBACK_SIZE): FlashCard[] {
  const order: CardKind[] = ['moment', 'meaning', 'word']
  return pickFlashbackWords(entries, now, size).map((e, i) => cardFor(e, order[i % order.length]))
}

/** Edit distance where swapping two neighbouring letters ("thirve") counts as one typo. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

export type AnswerCheck = 'right' | 'close' | 'wrong'

/** Forgiving: any inflection counts, a typo or two is "close". */
export function checkAnswer(input: string, word: string): AnswerCheck {
  const typed = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!typed) return 'wrong'
  if (typed === word) return 'right'
  const pattern = wordPattern(word)
  const m = typed.match(pattern)
  if (m && m[0] === typed && typed.length - word.length <= 4) return 'right'
  const allowed = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0
  return distance(typed, word) <= allowed ? 'close' : 'wrong'
}

/** "t _ _ _ _ _": the first letter and the length, spaces kept. */
export function hintFor(word: string): string {
  return [...word].map((c, i) => (i === 0 || c === ' ' || c === '-' ? c : '_')).join(' ')
}
