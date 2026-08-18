import { describe, expect, it } from "vitest";
import { parseIntent, parseTranscript } from "./voiceParse";

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

// The three defects spec §3.1 names, each a classification rule rather than
// another branch in a regex.
describe("parseTranscript — defects PI-6 fixes", () => {
  it("reads a spelled-out English quantity", () => {
    expect(parseTranscript("six wire rate 1650")).toEqual({
      name: "wire",
      qty: 6,
      rate: 1650,
    });
  });

  it("reads a quantity that is not at the front, when a unit marks it", () => {
    expect(parseTranscript("wire 6 nos rate 1650")).toEqual({
      name: "wire",
      qty: 6,
      rate: 1650,
    });
  });

  it("does not read an item code as a price", () => {
    expect(parseTranscript("2 wire code 4402")).toEqual({
      name: "wire code 4402",
      qty: 2,
      rate: null,
    });
  });

  it("joins a two-word quantity", () => {
    expect(parseTranscript("twenty five wire rate 1650")).toEqual({
      name: "wire",
      qty: 25,
      rate: 1650,
    });
  });

  it("drops the unit word after a leading quantity", () => {
    expect(parseTranscript("6 nos wire rate 1650")).toEqual({
      name: "wire",
      qty: 6,
      rate: 1650,
    });
  });
});

// Spec §3.4. "1.5 sq" and "2.5 sq" are item names in this domain, and the
// idiom is quantity-first-as-a-whole-number. Teaching the qty rule to accept
// decimals turns a correct parse into a wrong one.
describe("parseTranscript — decimals stay part of the name", () => {
  it("keeps a leading decimal in the name, qty 1", () => {
    expect(parseTranscript("2.5 sq wire")).toEqual({
      name: "2.5 sq wire",
      qty: 1,
      rate: null,
    });
  });

  it("still reads a decimal rate", () => {
    expect(parseTranscript("4 lug rate 12.50").rate).toBe(12.5);
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

describe("parseIntent", () => {
  it("treats an ordinary line as an add", () => {
    const r = parseIntent("6 wire 1.5sq rate 1650");
    expect(r.kind).toBe("add");
    if (r.kind !== "add") throw new Error("unreachable");
    expect(r.item).toEqual({ name: "wire 1.5sq", qty: 6, rate: 1650 });
  });

  it("reads a rate change", () => {
    const r = parseIntent("change wire rate to 1800");
    expect(r).toEqual({ kind: "set", target: "wire", field: "rate", value: 1800 });
  });

  it("reads a quantity change", () => {
    const r = parseIntent("change wire quantity to 5");
    expect(r).toEqual({ kind: "set", target: "wire", field: "qty", value: 5 });
  });

  it("accepts the other change words", () => {
    expect(parseIntent("set MCB rate to 450").kind).toBe("set");
    expect(parseIntent("update socket rate 120").kind).toBe("set");
  });

  it("keeps a multi-word target intact", () => {
    const r = parseIntent("change copper wire 2.5sq rate to 1800");
    expect(r).toEqual({ kind: "set", target: "copper wire 2.5sq", field: "rate", value: 1800 });
  });

  it("reads a Telugu change word", () => {
    const r = parseIntent("మార్చు wire రేటు 1800");
    expect(r.kind).toBe("set");
    if (r.kind !== "set") throw new Error("unreachable");
    expect(r.field).toBe("rate");
    expect(r.value).toBe(1800);
  });

  // --- The gate. Anything uncertain must fall back to ADD -----------------
  //
  // A wrongly-detected edit silently changes a price Dad already checked. A
  // wrongly-detected add leaves a visible extra row he can delete. The costs
  // are not symmetric, so the default is always ADD.

  it("falls back to add when the change word is not at the front", () => {
    expect(parseIntent("wire change rate 1800").kind).toBe("add");
  });

  it("falls back to add when there is no field keyword", () => {
    expect(parseIntent("change wire to 1800").kind).toBe("add");
  });

  it("falls back to add when there is no number", () => {
    expect(parseIntent("change wire rate").kind).toBe("add");
  });

  it("falls back to add when nothing names a target", () => {
    expect(parseIntent("change rate to 1800").kind).toBe("add");
  });

  it("never treats an item code as a value to set", () => {
    expect(parseIntent("change wire code to 4402").kind).toBe("add");
  });

  it("refuses an item code even when a field keyword is present", () => {
    // Reaches the value-scanning loop with fieldAt set, so this is what
    // actually exercises the CODE_WORDS guard. The existing
    // "change wire code to 4402" case short-circuits earlier, at the
    // no-field-keyword branch, and never reaches it.
    expect(parseIntent("change wire rate code 4402").kind).toBe("add");
  });

  it("accepts every change word, so a typo in one is caught", () => {
    expect(parseIntent("make wire rate 1800").kind).toBe("set");
    expect(parseIntent("correct wire rate 1800").kind).toBe("set");
    expect(parseIntent("edit wire rate 1800").kind).toBe("set");
  });

  it("survives empty input", () => {
    expect(parseIntent("").kind).toBe("add");
    expect(parseIntent("   ").kind).toBe("add");
  });
});
