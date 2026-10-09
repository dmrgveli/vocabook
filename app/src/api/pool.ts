import { buildRings, type PoolItem } from "../data/pool";
import { levelOf, loadLevels } from "../data/levels";
import type { CorpusData } from "../data/model";
import { corpusAvailable, fetchCorpusData } from "./corpus";
import * as datamuse from "./datamuse";
import { lookUp } from "./enrich";

// Everything the word pool needs for one word: the dictionary entry (synonyms, definitions,
// neighbours), Datamuse's "means like" and, with rich word data, the corpus (similar words,
// collocations). Kept for the session, like look-ups.

export interface PoolData {
  word: string;
  rings: PoolItem[][];
}

/** The corpus usually answers from the Worker's cache; a cold word can take a while, and the pool won't wait for long. */
const CORPUS_WAIT_MS = 7000;

const pools = new Map<string, Promise<PoolData>>();

function corpusFor(word: string): Promise<CorpusData | undefined> {
  if (!corpusAvailable()) return Promise.resolve(undefined);
  return Promise.race([
    fetchCorpusData(word).catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(resolve, CORPUS_WAIT_MS)),
  ]);
}

async function load(
  word: string,
): Promise<{ data: PoolData; complete: boolean }> {
  const [entry, ml, corpus] = await Promise.all([
    lookUp(word)
      .first.then((r) => r.enrichment)
      .catch(() => undefined),
    datamuse.meansLike(word).catch(() => [] as string[]),
    corpusFor(word),
    loadLevels().catch(() => undefined),
  ]);
  if (!entry && ml.length === 0) throw new Error(`Nothing found for “${word}”`);

  // the main sense only: a second part of speech or sense drifts off ("decision" in boxing: defeat, opponent)
  const definitions = (entry?.meanings[0]?.definitions ?? [])
    .slice(0, 2)
    .map((d) => d.definition);
  const collocates: { word: string; phrase: string }[] = [];
  const groups = corpus?.groups ?? [];
  for (let round = 0; round < 4; round++) {
    for (const g of groups) {
      const it = g.items[round];
      if (it && !it.word.includes(" "))
        collocates.push({ word: it.word, phrase: it.phrase });
    }
  }
  if (!corpus) {
    const c = entry?.collocations;
    const classic = [
      ...(c?.before ?? []).map((x) => ({
        word: x.word,
        phrase: `${x.word} ${word}`,
        score: x.score ?? 0,
      })),
      ...(c?.after ?? []).map((x) => ({
        word: x.word,
        phrase: `${word} ${x.word}`,
        score: x.score ?? 0,
      })),
    ];
    collocates.push(...classic.sort((a, b) => b.score - a.score));
  }

  const rings = buildRings(
    word,
    {
      synonyms: entry?.synonyms ?? [],
      meansLike: ml,
      similar: corpus?.similar ?? [],
      definitions,
      collocates,
    },
    { levelOf, isFunctionWord: datamuse.isFunctionWord },
  );
  return {
    data: { word, rings },
    complete: Boolean(corpus) || !corpusAvailable(),
  };
}

export function fetchPool(word: string): Promise<PoolData> {
  let pending = pools.get(word);
  if (!pending) {
    const loading = load(word);
    pending = loading.then((r) => r.data);
    // a pool built without the corpus (it was slow) is rebuilt next time
    loading
      .then((r) => !r.complete && pools.delete(word))
      .catch(() => pools.delete(word));
    pools.set(word, pending);
  }
  return pending;
}
