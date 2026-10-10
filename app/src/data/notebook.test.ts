import { describe, expect, it } from "vitest";
import {
  createEncounter,
  createEntry,
  type Enrichment,
  type Entry,
} from "./model";
import { lineSentence, topPhrases } from "./notebook";

const enrichment = (e: Partial<Enrichment>): Enrichment => ({
  fetchedAt: "2026-10-09T10:00:00Z",
  definitionsFrom: "datamuse",
  meanings: [],
  synonyms: [],
  antonyms: [],
  collocations: { before: [], after: [] },
  ...e,
});

function entry(
  word: string,
  extra: Partial<Entry> = {},
  sentence?: string,
): Entry {
  return {
    ...createEntry({
      word,
      encounter: createEncounter({ source: "Book", sentence }),
    }),
    ...extra,
  };
}

describe("topPhrases", () => {
  it("takes one phrase from each corpus group before a second from any", () => {
    const corpus = {
      fetchedAt: "",
      pos: "-n",
      examples: [],
      similar: [],
      groups: [
        {
          id: "adj",
          label: "Adjectives",
          items: [
            { word: "final", phrase: "final decision" },
            { word: "big", phrase: "big decision" },
          ],
        },
        {
          id: "obj",
          label: "Verbs before",
          items: [{ word: "make", phrase: "make a decision" }],
        },
      ],
    };
    expect(
      topPhrases(entry("decision", { enrichment: enrichment({ corpus }) })),
    ).toEqual(["final decision", "make a decision", "big decision"]);
  });

  it("falls back to the classic neighbours, most frequent first", () => {
    const collocations = {
      before: [{ word: "plants", score: 50 }],
      after: [
        { word: "on", score: 90 },
        { word: "in", score: 10 },
      ],
    };
    expect(
      topPhrases(
        entry("thrive", { enrichment: enrichment({ collocations }) }),
        2,
      ),
    ).toEqual(["thrive on", "plants thrive"]);
    expect(topPhrases(entry("thrive"))).toEqual([]);
  });
});

describe("lineSentence", () => {
  it("prefers your own sentence, then where you met the word", () => {
    expect(
      lineSentence(
        entry("grit", { ownSentence: "It took grit." }, "Met here."),
      ),
    ).toEqual({ text: "It took grit.", mine: true });
    expect(lineSentence(entry("grit", {}, "Met here."))).toEqual({
      text: "Met here.",
      mine: true,
    });
  });

  it("then a real example, then a dictionary example", () => {
    const corpus = {
      fetchedAt: "",
      pos: "-n",
      groups: [],
      similar: [],
      examples: [{ before: "Sheer", word: "grit", after: "." }],
    };
    expect(
      lineSentence(entry("grit", { enrichment: enrichment({ corpus }) })),
    ).toEqual({ text: "Sheer grit.", mine: false });
    const meanings = [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "courage" },
          { definition: "resolve", example: "She has grit." },
        ],
      },
    ];
    expect(
      lineSentence(entry("grit", { enrichment: enrichment({ meanings }) })),
    ).toEqual({ text: "She has grit.", mine: false });
    expect(lineSentence(entry("grit"))).toBeUndefined();
  });
});

describe('takeFirst', () => {
  it('cuts across groups and keeps each group total', async () => {
    const { takeFirst } = await import('./notebook')
    const g = (key: string, n: number) => ({ key, entries: Array.from({ length: n }, (_, i) => entry(`${key}${i}`)) })
    const out = takeFirst([g('a', 3), g('b', 4), g('c', 2)], 5)
    expect(out.map((x) => [x.key, x.entries.length, x.total])).toEqual([
      ['a', 3, 3],
      ['b', 2, 4],
    ])
  })
})

describe('searchEntry', () => {
  it('finds a word by what it means and where you met it, best match first', async () => {
    const { searchEntry, rankBySearch } = await import('./notebook')
    const meanings = [{ partOfSpeech: 'verb', definitions: [{ definition: 'To grow or develop well', example: 'Plants thrive here.' }] }]
    const thrive = entry('thrive', { enrichment: enrichment({ meanings, synonyms: ['flourish'] }), translation: 'gelişmek' }, 'Heard it on a podcast')
    const grow = entry('grow')
    expect(searchEntry(thrive, 'develop')).toEqual({ score: 40, field: 'a definition' })
    expect(searchEntry(thrive, 'GELİŞ')?.field).toBe('translation')
    expect(searchEntry(thrive, 'podcast')?.field).toBe('where you met it')
    expect(searchEntry(thrive, 'flour')?.field).toBe('related words')
    expect(searchEntry(grow, 'develop')).toBeUndefined()
    expect(rankBySearch([thrive, grow], 'gro').map((e) => e.word)).toEqual(['grow', 'thrive'])
  })
})
