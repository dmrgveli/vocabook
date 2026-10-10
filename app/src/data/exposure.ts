import { alive, isPractice, metEncounters, type Entry, type Mastery } from './model'

// Exposure: how much time you've spent with a word, worked out from what you did with it.
// It only grows: every look, every new place you meet it, every Flashback round and
// everything you write about it adds to it. Nothing is asked of you and nothing is lost
// by a break. It replaces the old self-rating (Seen it / Know it / Use it), which still
// counts for words that had one.

export const EXPOSURE_LEVELS = [1, 2, 3, 4, 5] as const
export type ExposureLevel = (typeof EXPOSURE_LEVELS)[number]

export const EXPOSURE_LABELS: Record<ExposureLevel, string> = {
  1: 'Just met',
  2: 'Crossed paths',
  3: 'Familiar',
  4: 'Close',
  5: 'Old friend',
}

/** Points needed for each level (level 1 is where every word starts). */
const LEVEL_AT = [0, 5, 12, 24, 40]

export const POINTS = {
  /** adding the word */
  added: 1,
  /** each look at its page (once in ten minutes, see db.markViewed) */
  view: 1,
  /** each place you met it after the first */
  metAgain: 3,
  /** an encounter written down with its sentence */
  sentence: 1,
  /** a Flashback round, by how it went */
  remembered: 3,
  rememberedLater: 2,
  practised: 1,
  ownSentence: 4,
  translation: 1,
  /** each note, up to MAX_NOTES */
  note: 2,
} as const
const MAX_NOTES = 3

/** The old self-rating, kept as a head start. */
const MASTERY_POINTS: Record<Mastery, number> = { recognize: 0, understand: 3, use: 6 }

export interface Exposure {
  points: number
  level: ExposureLevel
  /** 0–1 towards the next level (1 at the top) */
  progress: number
  views: number
  /** places met, practice rounds not included */
  met: number
  practised: number
}

/** Practice records carry their result in the label: "Flashback · remembered (the second time)". */
function practicePoints(source: string): number {
  if (source.endsWith('remembered the second time')) return POINTS.rememberedLater
  if (source.endsWith('remembered')) return POINTS.remembered
  return POINTS.practised
}

export function exposureOf(entry: Entry): Exposure {
  const met = metEncounters(entry)
  const practice = alive(entry.encounters).filter(isPractice)
  const views = entry.views ?? 0
  const points =
    POINTS.added +
    views * POINTS.view +
    Math.max(0, met.length - 1) * POINTS.metAgain +
    met.filter((e) => e.sentence?.trim()).length * POINTS.sentence +
    practice.reduce((n, p) => n + practicePoints(p.source), 0) +
    (entry.ownSentence?.trim() ? POINTS.ownSentence : 0) +
    (entry.translation?.trim() ? POINTS.translation : 0) +
    Math.min(MAX_NOTES, alive(entry.notes).length) * POINTS.note +
    MASTERY_POINTS[entry.mastery]
  let i = 0
  while (i + 1 < LEVEL_AT.length && points >= LEVEL_AT[i + 1]) i++
  const next = LEVEL_AT[i + 1]
  return {
    points,
    level: (i + 1) as ExposureLevel,
    progress: next === undefined ? 1 : (points - LEVEL_AT[i]) / (next - LEVEL_AT[i]),
    views,
    met: met.length,
    practised: practice.length,
  }
}

export const exposureLevel = (entry: Entry) => exposureOf(entry).level

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

/** "Opened 7 times · met in 2 places · practised 3 times · your own sentence" */
export function exposureSummary(entry: Entry, x = exposureOf(entry)): string {
  const parts = [
    x.views > 0 && `opened ${times(x.views)}`,
    x.met > 1 && `met in ${x.met} places`,
    x.practised > 0 && `practised ${times(x.practised)}`,
    entry.ownSentence?.trim() && 'your own sentence',
  ].filter(Boolean) as string[]
  const text = parts.length ? parts.join(' · ') : 'just added'
  return text[0].toUpperCase() + text.slice(1)
}
