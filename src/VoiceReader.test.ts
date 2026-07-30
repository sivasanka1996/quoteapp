import { describe, expect, it } from "vitest";
import { parseTranscript } from "./VoiceReader";

describe("parseTranscript — English (en-IN)", () => {
  it("pulls leading qty and trailing rate keyword", () => {
    expect(parseTranscript("6 wire 1.5sq rate 1650")).toEqual({
      name: "wire 1.5sq",
      qty: 6,
      rate: 1650,
    });
  });

  it("handles a bare trailing number as the rate", () => {
    expect(parseTranscript("4 MCB 32 amp 450")).toEqual({
      name: "MCB 32 amp",
      qty: 4,
      rate: 450,
    });
  });

  it("strips comma grouping from the rate", () => {
    expect(parseTranscript("2 cable rs 12,500").rate).toBe(12500);
  });

  it("defaults qty to 1 and rate to null", () => {
    expect(parseTranscript("conduit pipe")).toEqual({
      name: "conduit pipe",
      qty: 1,
      rate: null,
    });
  });
});

describe("parseTranscript — Telugu (te-IN)", () => {
  it("reads a Telugu rate keyword", () => {
    expect(parseTranscript("5 వైర్ రేటు 1650")).toEqual({
      name: "వైర్",
      qty: 5,
      rate: 1650,
    });
  });

  it("reads ధర as a rate keyword", () => {
    expect(parseTranscript("3 స్విచ్ ధర 240").rate).toBe(240);
  });

  it("converts Telugu digits to ASCII", () => {
    expect(parseTranscript("౫ వైర్ రేటు ౧౬౫౦")).toEqual({
      name: "వైర్",
      qty: 5,
      rate: 1650,
    });
  });

  it("reads a spelled-out Telugu quantity", () => {
    expect(parseTranscript("ఐదు స్క్వేర్ ఎంఎం వైర్")).toEqual({
      name: "స్క్వేర్ ఎంఎం వైర్",
      qty: 5,
      rate: null,
    });
  });

  it("keeps the whole transcript as the name when nothing else parses", () => {
    expect(parseTranscript("వైర్")).toEqual({
      name: "వైర్",
      qty: 1,
      rate: null,
    });
  });
});
