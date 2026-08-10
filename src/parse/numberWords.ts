// Number words in both languages.
//
// Why this exists: Chrome's recogniser very often returns "six" where Dad said
// a digit, and the old parser only understood Telugu 1–10 and no English words
// at all — so "six wire rate 1650" came out as quantity 1. Spec §3.2 names this
// as a plausible root cause of the failure Siva reported.
//
// Both tables are consulted whatever the language setting says, because the
// recogniser does not respect it: te-IN happily returns English words and
// digits for numbers. Accepting both costs nothing and fixes real transcripts.

import type { VoiceLang } from "../voiceParse";

const EN: Record<string, number> = {
  zero: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
};

const TE: Record<string, number> = {
  సున్నా: 0,
  ఒకటి: 1, ఒక: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5,
  ఆరు: 6, ఏడు: 7, ఎనిమిది: 8, తొమ్మిది: 9, పది: 10,
  పదకొండు: 11, పన్నెండు: 12, పదమూడు: 13, పద్నాలుగు: 14, పదిహేను: 15,
  పదహారు: 16, పదిహేడు: 17, పద్దెనిమిది: 18, పంతొమ్మిది: 19,
  ఇరవై: 20, ముప్పై: 30, నలభై: 40, యాభై: 50,
  అరవై: 60, డెబ్బై: 70, ఎనభై: 80, తొంభై: 90,
  వంద: 100, నూరు: 100,
};

/** Strip case and the punctuation a recogniser sprinkles in. */
function clean(token: string): string {
  return (token ?? "").toLowerCase().replace(/[.,!?;:]+$/g, "").trim();
}

/**
 * One token as a number, or null if it is not a number word.
 *
 * `lang` is accepted for call-site clarity but both tables are always tried —
 * see the file header for why that is deliberate rather than sloppy.
 */
export function wordToNumber(token: string, lang: VoiceLang): number | null {
  void lang;
  const t = clean(token);
  if (!t) return null;

  if (t in EN) return EN[t];
  if (t in TE) return TE[t];

  // "twenty-five" arrives as one token from some recognisers.
  if (t.includes("-")) {
    const parts = t.split("-").filter(Boolean);
    if (parts.length === 2) {
      const a = wordToNumber(parts[0], lang);
      const b = wordToNumber(parts[1], lang);
      if (a !== null && b !== null && isTens(a) && b >= 1 && b <= 9) {
        return a + b;
      }
    }
  }
  return null;
}

function isTens(n: number): boolean {
  return n >= 20 && n <= 90 && n % 10 === 0;
}

export interface PhraseNumber {
  value: number;
  /** How many tokens the number used up, so the caller can skip them. */
  consumed: number;
}

/**
 * Read a number that may span several tokens, starting at `tokens[0]`.
 *
 * Only the two patterns people actually say are joined — tens-then-unit
 * ("twenty five") and a hundreds multiplier ("two hundred fifty"). Everything
 * else stops at one token on purpose: greedily adding consecutive numbers
 * would turn "six six" into 12, and two quantities said in a row is much more
 * likely than someone meaning twelve that way.
 */
export function phraseToNumber(
  tokens: string[],
  lang: VoiceLang
): PhraseNumber | null {
  if (!tokens || tokens.length === 0) return null;

  const first = wordToNumber(tokens[0], lang);
  if (first === null) return null;

  const second = tokens.length > 1 ? wordToNumber(tokens[1], lang) : null;

  // "two hundred" / "two hundred fifty"
  if (second === 100 && first >= 1 && first <= 99) {
    const third = tokens.length > 2 ? wordToNumber(tokens[2], lang) : null;
    if (third !== null && third > 0 && third < 100) {
      return { value: first * 100 + third, consumed: 3 };
    }
    return { value: first * 100, consumed: 2 };
  }

  // "twenty five"
  if (isTens(first) && second !== null && second >= 1 && second <= 9) {
    return { value: first + second, consumed: 2 };
  }

  return { value: first, consumed: 1 };
}
