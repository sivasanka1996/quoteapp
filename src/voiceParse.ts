// Voice transcript → one quote line.
//
// This is a tokenizer, not a regex chain, and that is the point of PI-6. The
// old version asked three separate regexes three separate questions — "does it
// start with a digit", "does it end with a number", "is the first word Telugu
// for a number" — so every new case needed another branch, and the cases it
// missed were the ones Dad actually says:
//
//   "six wire rate 1650"    → qty 1   (the digit test failed)
//   "wire 6 nos rate 1650"  → qty 1   (the quantity was not at the front)
//   "2 wire code 4402"      → rate 4402 (an item code read as a price)
//
// Tokenize → classify → assemble turns each of those into a rule about what a
// token *is*, which composes instead of accumulating branches.
//
// Remember there is no model here at all. Recognition is the browser's Web
// Speech API (spec §0.3); this file only sees the text it produced.

import { log } from "./log/logger";
import { phraseToNumber, wordToNumber } from "./parse/numberWords";

export interface VoiceItem {
  name: string;
  qty: number;
  rate: number | null;
}

export type VoiceLang = "en-IN" | "te-IN";
export const VOICE_LANG_KEY = "quoteapp.voiceLang";

// Words that mean "the number next to me is a count, not a price".
const UNIT_WORDS = new Set([
  "no", "nos", "number", "numbers", "pc", "pcs", "piece", "pieces",
  "unit", "units", "qty", "quantity", "set", "sets", "pair", "pairs",
  "roll", "rolls", "coil", "coils", "box", "boxes", "bundle", "bundles",
  "meter", "meters", "metre", "metres", "mtr", "mtrs", "mts",
  "సంఖ్య", "నంబర్", "పీసు", "పీసులు", "మీటర్", "మీటర్లు",
]);

// Words that mean "the number after me is a price".
const RATE_WORDS = new Set([
  "rate", "rates", "at", "price", "priced", "cost", "costs", "each", "per",
  "rs", "rs.", "rupees", "rupee", "₹",
  "రేటు", "రేట్", "ధర", "వెల",
]);

// Words that mean "the number after me is NOT a price". Without this a
// trailing item code is indistinguishable from a trailing rate, and the
// trailing-number rule below happily prices the line at 4402.
const CODE_WORDS = new Set([
  "code", "codes", "item", "model", "cat", "catalogue", "catalog",
  "part", "ref", "reference", "sku", "కోడ్",
]);

type TokenKind = "NUM" | "NUM_WORD" | "UNIT" | "RATE_KW" | "CODE_KW" | "WORD";

interface Token {
  raw: string;
  kind: TokenKind;
  /** Set for NUM only. NUM_WORD values are resolved during assembly, because
   *  a number word can span tokens ("twenty five"). */
  value: number;
  /** Whole numbers only can be a quantity — see the decimals note below. */
  isInt: boolean;
}

// Telugu digits ౦-౯ (U+0C66–U+0C6F) → ASCII, so a spoken Telugu numeral is
// just a number like any other by the time it reaches the classifier.
function normalizeDigits(s: string): string {
  return s.replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66));
}

/** A bare number, optionally comma-grouped: "6", "12,500", "2.5". */
const NUMERIC = /^(\d[\d,]*)(\.\d+)?$/;

function classify(raw: string, lang: VoiceLang): Token {
  const lower = raw.toLowerCase().replace(/[.,!?;:]+$/g, "");

  const m = NUMERIC.exec(raw);
  if (m) {
    const value = parseFloat(raw.replace(/,/g, ""));
    return {
      raw,
      kind: "NUM",
      value,
      isInt: Number.isInteger(value) && !raw.includes("."),
    };
  }

  if (RATE_WORDS.has(lower)) return { raw, kind: "RATE_KW", value: 0, isInt: false };
  if (CODE_WORDS.has(lower)) return { raw, kind: "CODE_KW", value: 0, isInt: false };
  if (UNIT_WORDS.has(lower)) return { raw, kind: "UNIT", value: 0, isInt: false };

  // Checked last so a unit or keyword never loses to a number word.
  if (wordToNumber(raw, lang) !== null) {
    return { raw, kind: "NUM_WORD", value: 0, isInt: true };
  }

  return { raw, kind: "WORD", value: 0, isInt: false };
}

export function parseTranscript(text: string): VoiceItem {
  try {
    return assemble(text);
  } catch (e) {
    // Parsing layer (spec §2.4): log, then degrade rather than crash. Dad's
    // words are kept as the item name so nothing he said is lost — he can fix
    // the qty and rate in the confirm list, which is the same repair he makes
    // when the recogniser mishears a number.
    log.error("voice", "transcript could not be parsed", e, {
      length: text?.length,
    });
    return { name: (text ?? "").trim(), qty: 1, rate: null };
  }
}

function assemble(text: string): VoiceItem {
  const cleaned = normalizeDigits((text ?? "").trim());
  const raws = cleaned.split(/\s+/).filter(Boolean);
  // The language setting is not consulted for numbers — both tables are always
  // tried, because the recogniser returns English digits in Telugu mode. See
  // the header of parse/numberWords.ts.
  const lang: VoiceLang = "en-IN";
  const tokens = raws.map((r) => classify(r, lang));

  const used = new Array<boolean>(tokens.length).fill(false);
  let qty = 1;
  let rate: number | null = null;

  // --- Quantity -----------------------------------------------------------
  //
  // Whole numbers only, deliberately. "1.5 sq" and "2.5 sq" are item *names*
  // in this trade and the idiom is quantity-first-as-a-whole-number, so
  // accepting a decimal here would parse "2.5 sq wire" as 2.5 of "sq wire" —
  // turning a correct parse into a wrong one (spec §3.4). A fractional
  // quantity is typed into the qty field afterwards.
  const qtyAt = findQuantity(tokens, raws, lang);
  if (qtyAt) {
    qty = qtyAt.value;
    for (let i = qtyAt.start; i < qtyAt.start + qtyAt.consumed; i++) used[i] = true;
    // "6 nos wire" — the unit word did its job and is not part of the name.
    const after = qtyAt.start + qtyAt.consumed;
    if (tokens[after]?.kind === "UNIT") used[after] = true;
  }

  // --- Rate ---------------------------------------------------------------
  const rateAt = findRate(tokens, used);
  if (rateAt) {
    rate = rateAt.value;
    for (const i of rateAt.indices) used[i] = true;
  }

  const name = raws.filter((_, i) => !used[i]).join(" ").trim();

  log.debug("voice", "transcript parsed", {
    tokens: tokens.map((t) => t.kind),
    qty,
    rate,
    nameLength: name.length,
  });

  return { name: name || cleaned, qty, rate };
}

interface QtyHit {
  value: number;
  start: number;
  consumed: number;
}

/**
 * Where the quantity is, if it is anywhere.
 *
 * Two patterns, in priority order:
 *   1. a number at the very front — "6 wire", "six wire", "twenty five wire"
 *   2. a number followed by a unit word — "wire 6 nos"
 *
 * Anything else leaves the quantity at 1, which is what a bare item name means.
 */
function findQuantity(
  tokens: Token[],
  raws: string[],
  lang: VoiceLang
): QtyHit | null {
  // 1. Leading number.
  const first = tokens[0];
  if (first?.kind === "NUM" && first.isInt) {
    return { value: first.value, start: 0, consumed: 1 };
  }
  if (first?.kind === "NUM_WORD") {
    const phrase = phraseToNumber(raws, lang);
    if (phrase) return { value: phrase.value, start: 0, consumed: phrase.consumed };
  }

  // 2. A number immediately before a unit word, wherever it sits.
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i + 1].kind !== "UNIT") continue;
    if (tokens[i].kind === "NUM" && tokens[i].isInt) {
      return { value: tokens[i].value, start: i, consumed: 1 };
    }
    if (tokens[i].kind === "NUM_WORD") {
      const phrase = phraseToNumber(raws.slice(i), lang);
      if (phrase) return { value: phrase.value, start: i, consumed: phrase.consumed };
    }
  }

  return null;
}

interface RateHit {
  value: number;
  indices: number[];
}

/**
 * Where the price is, if it is anywhere.
 *
 * A keyword wins outright — "rate 1650", "రేటు 1650", "rs 12,500". Failing
 * that, a number at the very end is taken as the price, which is how Dad says
 * it ("4 MCB 32 amp 450"). That fallback is refused when a code word precedes
 * the number, because "code 4402" is an identifier and pricing the line at
 * 4402 would be a confident, wrong answer.
 */
function findRate(tokens: Token[], used: boolean[]): RateHit | null {
  // 1. After a rate keyword.
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].kind !== "RATE_KW") continue;
    const next = tokens[i + 1];
    if (next.kind === "NUM" && !used[i + 1]) {
      return { value: next.value, indices: [i, i + 1] };
    }
  }

  // 2. A trailing bare number.
  const last = tokens.length - 1;
  if (last >= 0 && tokens[last].kind === "NUM" && !used[last]) {
    const before = tokens[last - 1];
    if (before?.kind === "CODE_KW") return null;
    return { value: tokens[last].value, indices: [last] };
  }

  return null;
}
