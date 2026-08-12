// The shared prompt, pinned by the defect it caused.
//
// These read like tests about wording because the prompt IS the code here —
// it is the only thing standing between Dad and a wrong rupee figure, and one
// sentence of it was measured putting wrong numbers on the screen.
import { describe, expect, test } from "vitest";
import { PROMPT } from "./schema.js";

describe("the rate instruction", () => {
  // THE DEFECT, measured live on 2026-08-12 against both qwen3.5-flash and
  // qwen3.7-flash. The prompt used to say:
  //
  //   "If a line shows both a smaller and a larger number, the smaller one is
  //    usually the unit rate. If no unit rate is written, leave rate out."
  //
  // On a line with only ONE price, that reads as an invitation to decide the
  // number is a line total. Both models took it. On the Telugu slip, "5 no
  // 1650" came back as **rate 330** — 1650 divided by 5 — and "3 no 240" as
  // **rate 80**. Three of five rows silently wrong, each by a plausible-looking
  // amount. That is the worst failure this app has: not a crash Dad can see,
  // but a number he would quote to a customer.
  //
  // With the wording below, every rate on both slips came back exactly as
  // written, on both models.
  test("says a lone price IS the rate, so it is not read as a line total", () => {
    expect(PROMPT).toMatch(/ONE price/);
    expect(PROMPT).toMatch(/IS the rate/);
  });

  test("forbids dividing the price by the quantity", () => {
    expect(PROMPT).toMatch(/not divide it by the quantity/i);
  });

  // The other half of the rule, and the reason the sentence existed at all.
  // The mock slip's row 3 reads "25 no  95 = 2375"; quoting 2375 as the unit
  // rate would be the same class of error in the other direction. Both models
  // return 95.
  test("keeps the two-price rule that stops a line total being quoted as a rate", () => {
    expect(PROMPT).toMatch(/TWO prices/);
    expect(PROMPT).toMatch(/smaller/);
  });

  test("still allows a genuinely priceless line to come back without a rate", () => {
    expect(PROMPT).toMatch(/no price written on it/i);
  });

  // Named exactly, so the sentence cannot quietly come back.
  test("no longer hedges with 'usually the unit rate'", () => {
    expect(PROMPT).not.toMatch(/usually the unit rate/);
  });
});
