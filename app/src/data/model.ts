// Notebook data model. Every record and sub-record carries updatedAt for sync;
// deletions never remove a record, they mark it with deletedAt.

export const MASTERY_LEVELS = ['recognize', 'understand', 'use'] as const
export type Mastery = (typeof MASTERY_LEVELS)[number]

export const MASTERY_LABELS: Record<Mastery, string> = {
  recognize: 'Recognize',
  understand: 'Understand',
  use: 'Use',
}

export const SOURCE_KINDS = ['show', 'movie', 'book', 'article', 'podcast', 'work', 'conversation', 'other'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/** ISO 8601 timestamp */
export type Timestamp = string

interface Syncable {
  id: string
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt?: Timestamp
}

/** One encounter with the word. The earliest one is where it was learned, with the original sentence. */
export interface Encounter extends Syncable {
  source: string
  sourceKind?: SourceKind
  sentence?: string
  /** Day of the encounter (YYYY-MM-DD); may differ from when it was recorded. */
  date: string
}

export interface MarginNote extends Syncable {
  text: string
}

export interface Meaning {
  partOfSpeech: string
  definitions: { definition: string; example?: string }[]
}

/**
 * Dictionary data, copied into the entry when it is fetched so the notebook
 * keeps working when the APIs are down.
 */
export interface Enrichment {
  fetchedAt: Timestamp
  /** Where the definitions came from; 'datamuse' means Free Dictionary was unavailable. */
  definitionsFrom: 'free-dictionary' | 'datamuse' | 'none'
  phonetic?: string
  audioUrl?: string
  meanings: Meaning[]
  synonyms: string[]
  antonyms: string[]
  origin?: string
  /** Words most often used with this one (Datamuse). adjectives/nouns are missing on entries fetched before Oct 2026. */
  collocations: { before: string[]; after: string[]; adjectives?: string[]; nouns?: string[] }
}

export interface Entry extends Syncable {
  word: string
  /** Datamuse frequency: occurrences per million words. */
  frequency?: number
  /** The user's own translation, written in their native language. */
  translation?: string
  ownSentence?: string
  encounters: Encounter[]
  notes: MarginNote[]
  tags: string[]
  mastery: Mastery
  enrichment?: Enrichment
  lastViewedAt?: Timestamp
}

export function now(): Timestamp {
  return new Date().toISOString()
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function newId(): string {
  return crypto.randomUUID()
}

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function createEncounter(fields: Omit<Encounter, keyof Syncable | 'date'> & { date?: string }): Encounter {
  const t = now()
  return {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    date: fields.date ?? today(),
    source: fields.source.trim(),
    sourceKind: fields.sourceKind,
    sentence: fields.sentence?.trim() || undefined,
  }
}

export function createNote(text: string): MarginNote {
  const t = now()
  return { id: newId(), createdAt: t, updatedAt: t, text: text.trim() }
}

export function createEntry(fields: {
  word: string
  frequency?: number
  translation?: string
  encounter?: Encounter
}): Entry {
  const t = now()
  return {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    word: normalizeWord(fields.word),
    frequency: fields.frequency,
    translation: fields.translation?.trim() || undefined,
    encounters: fields.encounter ? [fields.encounter] : [],
    notes: [],
    tags: [],
    mastery: 'recognize',
  }
}

/** Sub-records that have not been deleted */
export function alive<T extends { deletedAt?: string }>(items: T[]): T[] {
  return items.filter((i) => !i.deletedAt)
}

/** The first encounter: where and when the word was learned. */
export function firstEncounter(entry: Entry): Encounter | undefined {
  return alive(entry.encounters).reduce<Encounter | undefined>(
    (first, e) => (!first || e.date < first.date ? e : first),
    undefined,
  )
}
