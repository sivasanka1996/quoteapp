export interface VoiceItem {
  name: string;
  qty: number;
  rate: number | null;
}

export type VoiceLang = "en-IN" | "te-IN";
export const VOICE_LANG_KEY = "quoteapp.voiceLang";

// Telugu number words the recognizer emits instead of digits: "రెండు వైర్"
const TE_NUMBER_WORDS: Record<string, number> = {
  ఒకటి: 1, ఒక: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5,
  ఆరు: 6, ఏడు: 7, ఎనిమిది: 8, తొమ్మిది: 9, పది: 10,
};

// Telugu digits ౦-౯ (U+0C66–U+0C6F) → ASCII, so the number regexes below work
function normalizeDigits(s: string): string {
  return s.replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66));
}

export function parseTranscript(text: string): VoiceItem {
  const t = normalizeDigits(text.trim());

  // Extract leading number as qty: "6 wire" or "6- wire"
  let qty = 1;
  let rest = t;
  const qtyMatch = t.match(/^(\d+)\s*[-–]?\s+/);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1]);
    rest = t.slice(qtyMatch[0].length).trim();
  } else {
    // Telugu spelled-out quantity: "ఐదు స్క్వేర్ ఎంఎం వైర్"
    const wordMatch = t.match(/^(\S+)\s+/);
    const spelled = wordMatch && TE_NUMBER_WORDS[wordMatch[1]];
    if (spelled) {
      qty = spelled;
      rest = t.slice(wordMatch[0].length).trim();
    }
  }

  // Extract rate after keywords (English or Telugu) or a trailing number
  const rateMatch =
    rest.match(
      /(?:rate|at|₹|rs\.?|price|రేటు|రేట్|ధర|వెల)\s*(\d[\d,]*(?:\.\d+)?)\s*$/i
    ) || rest.match(/\s+(\d[\d,]*(?:\.\d+)?)\s*$/);
  const rate = rateMatch ? parseFloat(rateMatch[1].replace(/,/g, "")) : null;
  const name = (rateMatch
    ? rest.slice(0, rest.length - rateMatch[0].length)
    : rest
  ).trim();

  return { name: name || t, qty, rate };
}
