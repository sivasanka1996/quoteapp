import { describe, it, expect } from "vitest";
import { wordToNumber, phraseToNumber } from "./numberWords";

describe("English number words", () => {
  it("reads the units", () => {
    expect(wordToNumber("one", "en-IN")).toBe(1);
    expect(wordToNumber("six", "en-IN")).toBe(6);
    expect(wordToNumber("nine", "en-IN")).toBe(9);
  });

  it("reads the teens, where recognisers are least reliable", () => {
    expect(wordToNumber("ten", "en-IN")).toBe(10);
    expect(wordToNumber("twelve", "en-IN")).toBe(12);
    expect(wordToNumber("fifteen", "en-IN")).toBe(15);
    expect(wordToNumber("nineteen", "en-IN")).toBe(19);
  });

  it("reads the tens and a hundred", () => {
    expect(wordToNumber("twenty", "en-IN")).toBe(20);
    expect(wordToNumber("fifty", "en-IN")).toBe(50);
    expect(wordToNumber("ninety", "en-IN")).toBe(90);
    expect(wordToNumber("hundred", "en-IN")).toBe(100);
  });

  it("ignores case and surrounding punctuation", () => {
    expect(wordToNumber("SIX", "en-IN")).toBe(6);
    expect(wordToNumber("Six", "en-IN")).toBe(6);
    expect(wordToNumber("six,", "en-IN")).toBe(6);
  });

  it("reads a hyphenated compound as one token", () => {
    expect(wordToNumber("twenty-five", "en-IN")).toBe(25);
    expect(wordToNumber("forty-two", "en-IN")).toBe(42);
  });

  it("returns null for anything that is not a number word", () => {
    expect(wordToNumber("wire", "en-IN")).toBeNull();
    expect(wordToNumber("", "en-IN")).toBeNull();
    expect(wordToNumber("sq", "en-IN")).toBeNull();
  });
});

describe("Telugu number words", () => {
  it("reads the units", () => {
    expect(wordToNumber("ఒకటి", "te-IN")).toBe(1);
    expect(wordToNumber("రెండు", "te-IN")).toBe(2);
    expect(wordToNumber("ఐదు", "te-IN")).toBe(5);
    expect(wordToNumber("తొమ్మిది", "te-IN")).toBe(9);
  });

  it("reads ten to nineteen — the range that did not exist before", () => {
    expect(wordToNumber("పది", "te-IN")).toBe(10);
    expect(wordToNumber("పదకొండు", "te-IN")).toBe(11);
    expect(wordToNumber("పదిహేను", "te-IN")).toBe(15);
    expect(wordToNumber("పంతొమ్మిది", "te-IN")).toBe(19);
  });

  it("reads the tens and a hundred", () => {
    expect(wordToNumber("ఇరవై", "te-IN")).toBe(20);
    expect(wordToNumber("యాభై", "te-IN")).toBe(50);
    expect(wordToNumber("తొంభై", "te-IN")).toBe(90);
    expect(wordToNumber("వంద", "te-IN")).toBe(100);
  });

  it("returns null for an ordinary Telugu word", () => {
    expect(wordToNumber("వైర్", "te-IN")).toBeNull();
  });
});

describe("cross-language behaviour", () => {
  // Chrome's recogniser set to te-IN still returns English digits and words
  // for numbers more often than not, so Telugu mode has to accept both.
  it("accepts English number words in Telugu mode", () => {
    expect(wordToNumber("six", "te-IN")).toBe(6);
  });

  it("accepts Telugu number words in English mode", () => {
    expect(wordToNumber("ఆరు", "en-IN")).toBe(6);
  });
});

describe("phraseToNumber", () => {
  it("reads a single word and consumes one token", () => {
    expect(phraseToNumber(["six", "wire"], "en-IN")).toEqual({
      value: 6,
      consumed: 1,
    });
  });

  it("joins tens and units", () => {
    expect(phraseToNumber(["twenty", "five", "wire"], "en-IN")).toEqual({
      value: 25,
      consumed: 2,
    });
    expect(phraseToNumber(["ఇరవై", "ఐదు"], "te-IN")).toEqual({
      value: 25,
      consumed: 2,
    });
  });

  it("multiplies by a hundred", () => {
    expect(phraseToNumber(["two", "hundred"], "en-IN")).toEqual({
      value: 200,
      consumed: 2,
    });
    expect(phraseToNumber(["two", "hundred", "fifty"], "en-IN")).toEqual({
      value: 250,
      consumed: 3,
    });
  });

  // "six six" must not become 12 — two separate quantities said in a row is
  // far likelier than someone meaning 12 that way.
  it("does not add two units together", () => {
    expect(phraseToNumber(["six", "six"], "en-IN")).toEqual({
      value: 6,
      consumed: 1,
    });
  });

  it("returns null when the first token is not a number", () => {
    expect(phraseToNumber(["wire", "six"], "en-IN")).toBeNull();
    expect(phraseToNumber([], "en-IN")).toBeNull();
  });
});
