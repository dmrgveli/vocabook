// Turns a Datamuse frequency (occurrences per million words) into an approximate
// rank: "this word is among the 4,000 most common English words" → 4K.
//
// Calibration (7 Oct 2026): every 20th word of the 50k OpenSubtitles list
// (hermitdave/FrequencyWords) was looked up on Datamuse and the frequencies were
// sorted, so the n-th highest frequency marks rank ≈ n × 20. Only these thresholds
// ship with the app, not the list. Ranks are approximate (the list counts word
// forms, not lemmas), so the UI shows thousands only.
const THRESHOLDS: [rank: number, perMillion: number][] = [
  [1000, 68.7], [2000, 35], [3000, 22], [4000, 15.4], [5000, 11.5],
  [6000, 9.18], [7000, 7.31], [8000, 6.06], [9000, 5.16], [10000, 4.51],
  [11000, 3.82], [12000, 3.27], [13000, 2.9], [14000, 2.57], [15000, 2.26],
  [16000, 2.03], [17000, 1.81], [18000, 1.61], [19000, 1.45], [20000, 1.27],
  [25000, 0.738], [30000, 0.462], [35000, 0.265], [40000, 0.125],
]

export const MAX_K = 40

/** Approximate frequency rank, interpolated on a log scale between calibration points. */
export function estimateRank(perMillion: number): number {
  if (perMillion >= THRESHOLDS[0][1]) return Math.max(1, Math.round((THRESHOLDS[0][1] / perMillion) * 1000))
  for (let i = 1; i < THRESHOLDS.length; i++) {
    const [r1, f1] = THRESHOLDS[i - 1]
    const [r2, f2] = THRESHOLDS[i]
    if (perMillion >= f2) {
      const t = Math.log(f1 / perMillion) / Math.log(f1 / f2)
      return Math.round(r1 + t * (r2 - r1))
    }
  }
  return MAX_K * 1000 + 1
}

/** The thousand the word falls in: 1 = top 1,000 … MAX_K + 1 = rarer than 40K. */
export function frequencyK(perMillion: number | undefined): number | undefined {
  if (perMillion === undefined || perMillion <= 0) return undefined
  return Math.min(Math.ceil(estimateRank(perMillion) / 1000), MAX_K + 1)
}

export function formatK(k: number): string {
  return k > MAX_K ? `${MAX_K}K+` : `${k}K`
}

export function describeK(k: number): string {
  return k > MAX_K ? `Rarer than the ${MAX_K},000 most common words` : `Among the ${(k * 1000).toLocaleString('en-US')} most common words`
}

/** Groups of thousands used for colours and filters. */
export const K_BANDS = [
  { id: 'k1', label: '1K', max: 1 },
  { id: 'k3', label: '2–3K', max: 3 },
  { id: 'k5', label: '4–5K', max: 5 },
  { id: 'k10', label: '6–10K', max: 10 },
  { id: 'k20', label: '11–20K', max: 20 },
  { id: 'rare', label: '20K+', max: Infinity },
] as const

export type KBand = (typeof K_BANDS)[number]['id']

export function kBand(perMillion: number | undefined): KBand | undefined {
  const k = frequencyK(perMillion)
  return k === undefined ? undefined : K_BANDS.find((b) => k <= b.max)!.id
}

export function formatFrequency(perMillion: number): string {
  const digits = perMillion >= 10 ? 0 : perMillion >= 1 ? 1 : 2
  return `${perMillion.toFixed(digits)} per million words`
}
