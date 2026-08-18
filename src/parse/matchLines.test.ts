import { describe, it, expect } from "vitest";
import { matchLines, isAmbiguous } from "./matchLines";

const lines = [
  { id: 1, name: "Copper Wire 2.5sq" },
  { id: 2, name: "MCB 32A" },
  { id: 3, name: "Modular Socket 6A" },
];

describe("matchLines", () => {
  it("finds an exact name", () => {
    expect(matchLines("MCB 32A", lines)[0].id).toBe(2);
  });

  it("finds a line from one word of it", () => {
    expect(matchLines("socket", lines)[0].id).toBe(3);
  });

  it("ignores case", () => {
    expect(matchLines("mcb", lines)[0].id).toBe(2);
  });

  it("scores a fuller overlap higher", () => {
    const r = matchLines("copper wire", lines);
    expect(r[0].id).toBe(1);
    expect(r[0].score).toBeGreaterThan(r[1]?.score ?? 0);
  });

  it("returns nothing when no word matches", () => {
    expect(matchLines("transformer", lines)).toEqual([]);
  });

  it("returns nothing for an empty target", () => {
    expect(matchLines("", lines)).toEqual([]);
    expect(matchLines("   ", lines)).toEqual([]);
  });

  it("survives an empty line list", () => {
    expect(matchLines("wire", [])).toEqual([]);
  });

  it("sorts descending by score", () => {
    const r = matchLines("wire", [
      { id: 1, name: "Wire" },
      { id: 2, name: "Copper Wire 2.5sq armoured" },
    ]);
    expect(r[0].id).toBe(1);
  });
});

describe("isAmbiguous", () => {
  it("is false for a clear winner", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 1 }, { id: 2, name: "b", score: 0.3 }])).toBe(false);
  });

  it("is true for two close matches", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 0.8 }, { id: 2, name: "b", score: 0.75 }])).toBe(true);
  });

  it("is false with only one match", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 0.5 }])).toBe(false);
  });

  it("is false with no matches", () => {
    expect(isAmbiguous([])).toBe(false);
  });

  it("catches two identically-named lines", () => {
    const r = matchLines("wire", [{ id: 1, name: "Wire" }, { id: 2, name: "Wire" }]);
    expect(isAmbiguous(r)).toBe(true);
  });
});
