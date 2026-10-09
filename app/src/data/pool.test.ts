import { describe, expect, it } from "vitest";
import type { WordLevel } from "./levels";
import {
  buildRings,
  definitionWords,
  type PoolHelpers,
  type PoolSources,
} from "./pool";

const levels: Record<string, WordLevel> = {
  thrive: { level: 4 },
  thriving: { level: 4, family: "thrive" },
  flourish: { level: 4 },
  prosper: { level: 3 },
  grow: { level: 1 },
  develop: { level: 2 },
  developing: { level: 2, family: "develop" },
  boom: { level: 2 },
  plants: { level: 1, family: "plant" },
  riant: { level: "off" },
  burgeon: { level: 18 },
};
const h: PoolHelpers = {
  levelOf: (w) => levels[w],
  isFunctionWord: (w) => ["to", "or", "on", "the"].includes(w),
};

const none: PoolSources = {
  synonyms: [],
  meansLike: [],
  similar: [],
  definitions: [],
  collocates: [],
};

describe("buildRings", () => {
  it("puts words two sources agree on in the inner ring, before single-source ones", () => {
    const rings = buildRings(
      "thrive",
      {
        ...none,
        synonyms: ["boom", "flourish"],
        meansLike: ["prosper", "flourish"],
        similar: ["prosper"],
      },
      h,
    );
    expect(rings[0].map((i) => i.word)).toEqual([
      "flourish",
      "prosper",
      "boom",
    ]);
  });

  it("leaves out the word itself, its family, very rare words and lone weak candidates", () => {
    const meansLike = ["thriving", "riant", "burgeon", "a", "b", "c", "grow"];
    const rings = buildRings(
      "thrive",
      { ...none, synonyms: ["riant"], meansLike },
      h,
    );
    expect(rings[0]).toEqual([]);
    expect(rings[1].map((i) => i.word)).toEqual(["grow"]);
  });

  it("explains the word with its definition first, without repeating the inner ring", () => {
    const rings = buildRings(
      "thrive",
      {
        ...none,
        synonyms: ["grow", "flourish"],
        meansLike: ["flourish", "grow", "prosper"],
        definitions: ["(intransitive) To grow or develop well."],
      },
      h,
    );
    expect(rings[0].map((i) => i.word)).toEqual([
      "flourish",
      "grow",
      "prosper",
    ]);
    expect(rings[1].map((i) => i.word)).toEqual(["develop"]);
  });

  it("keeps the phrase a collocate makes", () => {
    const rings = buildRings(
      "thrive",
      {
        ...none,
        collocates: [
          { word: "plants", phrase: "plants thrive" },
          { word: "on", phrase: "thrive on" },
        ],
      },
      h,
    );
    expect(rings[2]).toEqual([
      { word: "plants", ring: 2, phrase: "plants thrive" },
    ]);
  });
});

describe("buildRings families", () => {
  it("keeps one form per family across the rings", () => {
    const rings = buildRings(
      "decision",
      {
        ...none,
        synonyms: ["choice", "choices"],
        meansLike: ["choice", "choices"],
        collocates: [
          { word: "maker", phrase: "decision maker" },
          { word: "makers", phrase: "decision makers" },
        ],
      },
      h,
    );
    expect(rings[0].map((i) => i.word)).toEqual(["choice"]);
    expect(rings[2].map((i) => i.word)).toEqual(["maker"]);
  });
});

describe("definitionWords", () => {
  it("turns forms into family heads and skips generic words", () => {
    expect(
      definitionWords("Something developing or growing", "thrive", h),
    ).toEqual(["develop", "growing"]);
  });
});
