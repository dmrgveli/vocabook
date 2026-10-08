// Notebook data model. Every record and sub-record carries updatedAt for sync;
// deletions never remove a record, they mark it with deletedAt.

export const MASTERY_LEVELS = ['recognize', 'understand', 'use'] as const
export type Mastery = (typeof MASTERY_LEVELS)[number]

// The stored values stay recognize/understand/use (sync, old data); only the labels changed.
export const MASTERY_LABELS: Record<Mastery, string> = {
  recognize: 'Seen it',
  understand: 'Know it',
  use: 'Use it',
}

export const MASTERY_HINTS: Record<Mastery, string> = {
  recognize: 'I recognize it when I read or hear it',
  understand: 'I know what it means',
  use: 'I can use it in my own sentences',
}

// 'flashback' marks a practice round recorded on the word's timeline (data/flashback.ts).
export const SOURCE_KINDS = ['show', 'movie', 'book', 'article', 'podcast', 'work', 'conversation', 'other', 'flashback'] as const
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
  /** Words most often used right before / after this one (Datamuse), most frequent first. */
  collocations: { before: Collocation[]; after: Collocation[] }
  /** Layout of this object; older versions are fetched again when the word is opened. */
  version?: number
}

/** A neighbouring word; `score` is Datamuse's relative frequency for the pair. */
export interface Collocation {
  word: string
  score?: number
}

export const ENRICHMENT_VERSION = 2

export function isEnrichmentCurrent(e: Enrichment | undefined): e is Enrichment {
  return (e?.version ?? 1) >= ENRICHMENT_VERSION
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
/** A Flashback round on the timeline: practice, not a place where the word was met. */
export const isPractice = (enc: Encounter) => enc.sourceKind === 'flashback'

/** The real encounters: alive and not practice. Sources, counts and "met again" use these. */
export function metEncounters(entry: Entry): Encounter[] {
  return alive(entry.encounters).filter((e) => !isPractice(e))
}

export function firstEncounter(entry: Entry): Encounter | undefined {
  return metEncounters(entry).reduce<Encounter | undefined>(
    (first, e) => (!first || e.date < first.date ? e : first),
    undefined,
  )
}
