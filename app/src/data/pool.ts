// The word pool: a word in the middle and three rings of words around it.
//   0 · similar meaning: words you could use instead
//   1 · explains it: words that say what it means
//   2 · used with it: words it often goes together with
// Relevance matters more than numbers, so a ring rather stays short than gets filled up
// with weak candidates. Pure functions; the fetching lives in api/pool.ts.

import type { WordLevel } from "./levels";

export type RingId = 0 | 1 | 2;

export const RING_NAMES = [
  "similar meaning",
  "explains it",
  "used with it",
] as const;
/** How many words each ring holds (the 3D layout has a fixed seat for each). */
export const RING_SIZES = [4, 4, 6] as const;
/** Words harder than this (thousands of word families) stay out of the rings: they explain nothing. */
export const MAX_POOL_LEVEL = 14;

export interface PoolItem {
  word: string;
  ring: RingId;
  /** used with it: the phrase they make together ("plants thrive") */
  phrase?: string;
}

export interface PoolSources {
  /** dictionary synonyms */
  synonyms: string[];
  /** Datamuse "means like", best first */
  meansLike: string[];
  /** corpus thesaurus: words used in the same contexts, best first */
  similar: string[];
  /** the word's first definitions, most important first */
  definitions: string[];
  /** collocates with the phrase they form, best first */
  collocates: { word: string; phrase: string }[];
}

export interface PoolHelpers {
  levelOf?: (word: string) => WordLevel | undefined;
  isFunctionWord: (word: string) => boolean;
}

const SINGLE_WORD = /^[a-z][a-z'-]{1,17}$/;

// Words every definition is built from, and adverbs that go with almost anything ("thrive best"); they explain nothing on their own.
const GENERIC = new Set(
  (
    "something someone somebody anything anyone thing things person people way ways kind type sort part " +
    "make makes made cause causes become becomes get gets give gives take takes use used using being having " +
    "especially usually typically generally often particular certain various state quality act fact one " +
    "well better best worse worst less least lot lots others"
  ).split(" "),
);

/** The family head ("developing" → "develop") when the level table knows it. */
const headOf = (w: string, h: PoolHelpers) => h.levelOf?.(w)?.family ?? w;

function sameFamily(a: string, b: string, h: PoolHelpers): boolean {
  if (a === b || headOf(a, h) === headOf(b, h)) return true;
  const stem = (w: string) => w.slice(0, Math.max(5, w.length - 2));
  return a.startsWith(stem(b)) || b.startsWith(stem(a));
}

function usable(candidate: string, word: string, h: PoolHelpers): boolean {
  if (
    !SINGLE_WORD.test(candidate) ||
    candidate.length < 3 ||
    h.isFunctionWord(candidate) ||
    GENERIC.has(candidate)
  )
    return false;
  if (sameFamily(candidate, word, h)) return false;
  const level = h.levelOf?.(candidate)?.level;
  return level === undefined || (level !== "off" && level <= MAX_POOL_LEVEL);
}

/** Content words of a definition, as family heads: "To grow or develop well." → grow, develop, well */
export function definitionWords(
  definition: string,
  word: string,
  h: PoolHelpers,
): string[] {
  const out: string[] = [];
  for (const raw of definition
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z'-]+/)) {
    const w = headOf(raw, h);
    if (usable(w, word, h) && !out.includes(w)) out.push(w);
  }
  return out;
}

export function buildRings(
  word: string,
  s: PoolSources,
  h: PoolHelpers,
): PoolItem[][] {
  const taken = new Set<string>();
  // one form per family across all rings: "maker" or "makers", "clutch" or "clutches"
  const ok = (w: string) =>
    usable(w, word, h) && ![...taken].some((t) => sameFamily(t, w, h));

  // similar meaning: agreement between sources counts most; a lone source must be near its top
  const score = new Map<
    string,
    { score: number; sources: number; strong: boolean }
  >();
  const add = (w: string, points: number, strong: boolean) => {
    const cur = score.get(w) ?? { score: 0, sources: 0, strong: false };
    score.set(w, {
      score: cur.score + points,
      sources: cur.sources + 1,
      strong: cur.strong || strong,
    });
  };
  s.synonyms.forEach((w, i) => add(w, 3 - i * 0.1, i < 4));
  s.meansLike.slice(0, 15).forEach((w, i) => add(w, 2 * (1 - i / 15), i < 3));
  s.similar.slice(0, 12).forEach((w, i) => add(w, 2 * (1 - i / 12), i < 4));
  const ranked = [...score]
    .filter(([w, v]) => ok(w) && (v.sources >= 2 || v.strong))
    .sort((a, b) => b[1].sources - a[1].sources || b[1].score - a[1].score);
  const same: string[] = [];
  for (const [w] of ranked) {
    if (same.length < RING_SIZES[0] && ok(w)) {
      same.push(w);
      taken.add(w);
    }
  }

  // explains it: what its definitions are made of, then the rest of "means like"
  const explains: string[] = [];
  for (const d of s.definitions) {
    for (const w of definitionWords(d, word, h))
      if (
        explains.length < 3 &&
        ok(w) &&
        !explains.some((x) => sameFamily(x, w, h))
      )
        explains.push(w);
  }
  explains.forEach((w) => taken.add(w));
  for (const w of s.meansLike) {
    if (explains.length < RING_SIZES[1] && ok(w)) {
      explains.push(w);
      taken.add(w);
    }
  }

  const used: PoolItem[] = [];
  for (const c of s.collocates) {
    if (used.length >= RING_SIZES[2]) break;
    if (ok(c.word)) {
      used.push({ word: c.word, ring: 2, phrase: c.phrase });
      taken.add(c.word);
    }
  }

  return [
    same.map((word) => ({ word, ring: 0 as const })),
    explains.map((word) => ({ word, ring: 1 as const })),
    used,
  ];
}
