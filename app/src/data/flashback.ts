import { alive, createEncounter, isPractice, metEncounters, now, type Entry, type Mastery } from './model'

// Flashback: a short round of recall with your own words, back in the moment you met them.
//
// Every card is answered by picking one of four options (no typing):
//  - moment:  your encounter sentence with a gap → which word fills it?
//  - meaning: your translation or a definition → which word is it?
//  - word:    the word → which meaning is it?
// Wrong options are other words from your own notebook, so even a miss is a little
// review. Words come in random order, but words that have been in fewer rounds are much
// more likely to be picked, so over time every word comes round about equally often.
// A finished round is written to each word's timeline (sourceKind 'flashback').

export const FLASHBACK_MIN_WORDS = 5
export const DEFAULT_ROUND_SIZE = 5
/** With more words than this, the user picks the round size. */
export const ASK_SIZE_ABOVE = 10
export const ROUND_SIZES = [5, 10, 15] as const
export const MIN_ROUND_SIZE = 3
const OPTIONS = 4
/** Older practice records on a word are dropped beyond this (the sync schema caps children). */
export const MAX_PRACTICE_RECORDS = 20

export type CardKind = 'moment' | 'meaning' | 'word'

export interface Choice {
  label: string
  correct: boolean
}

export interface FlashCard {
  entry: Entry
  kind: CardKind
  /** moment: the sentence with a gap; meaning: the clue; word: the word */
  prompt: string
  /** where the sentence or the word came from */
  source?: string
  choices: Choice[]
}

export type Random = () => number
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
  return wordPattern(word).test(sentence) ? sentence.replace(wordPattern(word), GAP) : undefined
}

/** A clue must not give the answer away: the word itself becomes "…". */
const hideWord = (text: string, word: string) => text.replace(wordPattern(word), '…')

export function clueFor(entry: Entry): string | undefined {
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  const clue = entry.translation ?? definition
  return clue && hideWord(clue, entry.word)
}

const definitionOf = (e: Entry) => e.enrichment?.meanings[0]?.definitions[0]?.definition

/**
 * Four meanings of the same kind for a "which meaning?" card: all translations, or all
 * definitions. A lone Turkish option among English ones would give the answer away.
 */
function meaningChoices(entry: Entry, all: Entry[], random: Random): Choice[] | undefined {
  for (const pick of [(e: Entry) => e.translation, definitionOf]) {
    const answer = pick(entry)
    if (!answer) continue
    const others = distractors(entry, all, OPTIONS - 1, random, (e) => Boolean(pick(e)))
    if (others.length < OPTIONS - 1) continue
    // each option hides its own word, so none of them looks different
    return shuffle(
      [entry, ...others].map((e, i) => ({ label: hideWord(pick(e)!, e.word), correct: i === 0 })),
      random,
    )
  }
  return undefined
}

/** How many finished rounds a word has been in. */
export const practiceCount = (entry: Entry) => alive(entry.encounters).filter(isPractice).length

/** Words you know less well come up a little more often. */
const MASTERY_WEIGHT: Record<Mastery, number> = { recognize: 1, understand: 0.8, use: 0.6 }

/**
 * Random words for a round, weighted towards words that were in fewer rounds
 * (weight 1 / (1 + rounds)²: a new word is four times as likely as one seen once).
 * Weighted sampling without replacement (Efraimidis–Spirakis).
 */
export function pickFlashbackWords(entries: Entry[], size: number, random: Random = Math.random): Entry[] {
  return entries
    .filter((e) => !e.deletedAt)
    .map((e) => {
      const weight = MASTERY_WEIGHT[e.mastery] / (1 + practiceCount(e)) ** 2
      return { e, key: Math.pow(random() || Number.MIN_VALUE, 1 / weight) }
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, size)
    .map((x) => x.e)
}

export function shuffle<T>(items: T[], random: Random = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const partOfSpeech = (e: Entry) => e.enrichment?.meanings[0]?.partOfSpeech

/** Other words from the notebook as wrong options, the same part of speech first. */
function distractors(entry: Entry, all: Entry[], count: number, random: Random, usable: (e: Entry) => boolean = () => true): Entry[] {
  const others = shuffle(
    all.filter((e) => !e.deletedAt && e.id !== entry.id && e.word !== entry.word && usable(e)),
    random,
  )
  const pos = partOfSpeech(entry)
  const same = others.filter((e) => pos && partOfSpeech(e) === pos)
  const rest = others.filter((e) => !same.includes(e))
  return [...same, ...rest].slice(0, count)
}

/** The card for a word; `prefer` varies the kind across a round when the word allows several. */
export function cardFor(entry: Entry, all: Entry[], prefer: CardKind = 'moment', random: Random = Math.random): FlashCard {
  const wordChoices = () =>
    shuffle(
      [{ label: entry.word, correct: true }, ...distractors(entry, all, OPTIONS - 1, random).map((e) => ({ label: e.word, correct: false }))],
      random,
    )
  const moments = metEncounters(entry)
    .filter((enc) => enc.sentence && withGap(enc.sentence, entry.word))
    .map((enc) => ({ prompt: withGap(enc.sentence!, entry.word)!, source: enc.source }))
  const clue = clueFor(entry)
  const firstSource = [...metEncounters(entry)].sort((a, b) => a.date.localeCompare(b.date))[0]?.source
  const meanings = meaningChoices(entry, all, random)

  const options: (() => FlashCard)[] = []
  const kinds: CardKind[] = []
  if (moments.length) {
    kinds.push('moment')
    options.push(() => ({ entry, kind: 'moment', ...moments[Math.floor(random() * moments.length)], choices: wordChoices() }))
  }
  if (clue) {
    kinds.push('meaning')
    options.push(() => ({ entry, kind: 'meaning', prompt: clue, source: firstSource, choices: wordChoices() }))
  }
  if (meanings) {
    kinds.push('word')
    options.push(() => ({ entry, kind: 'word', prompt: entry.word, source: firstSource, choices: meanings }))
  }
  // Nothing to ask with options (no sentence, no meaning yet): recall it and reveal.
  if (options.length === 0) return { entry, kind: 'word', prompt: entry.word, source: firstSource, choices: [] }
  const index = kinds.indexOf(prefer)
  return options[index >= 0 ? index : 0]()
}

/** A round: one card per word, the kinds taking turns where a word allows it. */
export function buildRound(entries: Entry[], size: number, random: Random = Math.random): FlashCard[] {
  const order: CardKind[] = ['moment', 'meaning', 'word']
  const start = Math.floor(random() * order.length)
  return pickFlashbackWords(entries, size, random).map((e, i) => cardFor(e, entries, order[(start + i) % order.length], random))
}

/** How many cards to play: 5 by default; above ASK_SIZE_ABOVE words the user chooses. */
export const shouldAskSize = (wordCount: number) => wordCount > ASK_SIZE_ABOVE

export function clampRoundSize(n: number, wordCount: number): number {
  return Math.max(Math.min(MIN_ROUND_SIZE, wordCount), Math.min(Math.round(n) || DEFAULT_ROUND_SIZE, wordCount))
}

export type RoundResult = 'first-try' | 'came-back' | 'still-learning'

export const RESULT_LABEL: Record<RoundResult, string> = {
  'first-try': 'remembered',
  'came-back': 'remembered the second time',
  'still-learning': 'still settling in',
}

/**
 * The word with this round written on its timeline. Only the latest
 * MAX_PRACTICE_RECORDS practice records are kept; older ones are marked deleted.
 */
export function withPracticeRecord(entry: Entry, result: RoundResult, sentence?: string): Entry {
  const record = createEncounter({ source: `Flashback · ${RESULT_LABEL[result]}`, sourceKind: 'flashback', sentence })
  const encounters = [...entry.encounters, record]
  const practice = alive(encounters)
    .filter(isPractice)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const drop = new Set(practice.slice(0, Math.max(0, practice.length - MAX_PRACTICE_RECORDS)).map((e) => e.id))
  const t = now()
  return { ...entry, encounters: encounters.map((e) => (drop.has(e.id) ? { ...e, deletedAt: t, updatedAt: t } : e)) }
}
