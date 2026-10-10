import { alive, isPractice, metEncounters, type Entry } from './model'

// What you've done with a word so far, in one quiet line on its page. Information only:
// it isn't a score and nothing else depends on it.

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

/** "Opened 7 times · met in 2 places · practised twice", or undefined for a word just added. */
export function activitySummary(entry: Entry): string | undefined {
  const views = entry.views ?? 0
  const met = metEncounters(entry).length
  const practised = alive(entry.encounters).filter(isPractice).length
  const parts = [views > 0 && `opened ${times(views)}`, met > 1 && `met in ${met} places`, practised > 0 && `practised ${times(practised)}`].filter(
    Boolean,
  ) as string[]
  if (!parts.length) return undefined
  const text = parts.join(' · ')
  return text[0].toUpperCase() + text.slice(1)
}
