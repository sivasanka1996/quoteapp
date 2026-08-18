// Spoken target text → which line in this quote Dad meant.
//
// A plain token-overlap scorer, not Fuse.js and emphatically not embeddings.
// CLAUDE.md's standing rule sizes the tool to the problem: this matches against
// the lines of ONE quote — a couple of dozen strings at most — so a dependency
// would cost more than it returns here. The same rule that puts Fuse.js on item
// search rules it out here.

export interface LineMatch {
  id: number;
  name: string;
  /** 0–1. Share of the target's words found in the line name. */
  score: number;
}

/** Two matches this close together are not a decision the app should make. */
const AMBIGUOUS_WITHIN = 0.15;

function words(s: string): string[] {
  // The Telugu block (U+0C00–U+0C7F) includes combining vowel signs alongside
  // the letters, which is exactly what a range covering the whole script has
  // to include — a line name in Telugu needs its matras kept attached to the
  // word they modify, not split off as separators.
  return (s ?? "")
    .toLowerCase()
    // eslint-disable-next-line no-misleading-character-class
    .split(/[^a-z0-9ఀ-౿.]+/i)
    .filter(Boolean);
}

/**
 * Candidate lines for a spoken name, best first.
 *
 * Scoring: the share of the target's words that appear in the line's name,
 * with a small penalty for a long name so "Wire" beats "Copper Wire 2.5sq
 * armoured" when Dad says "wire". Zero-scoring lines are dropped entirely —
 * "no match" must be distinguishable from "a bad match", because the caller
 * refuses to guess.
 */
export function matchLines(
  target: string,
  lines: { id: number; name: string }[]
): LineMatch[] {
  const want = words(target);
  if (want.length === 0 || !Array.isArray(lines)) return [];

  return lines
    .map((l) => {
      const have = words(l.name);
      if (have.length === 0) return { id: l.id, name: l.name, score: 0 };
      const hit = want.filter((w) => have.some((h) => h === w || h.startsWith(w))).length;
      if (hit === 0) return { id: l.id, name: l.name, score: 0 };
      const coverage = hit / want.length;
      // Prefer the tighter name when coverage ties.
      const brevity = want.length / have.length;
      return { id: l.id, name: l.name, score: coverage * (0.85 + 0.15 * Math.min(1, brevity)) };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * True when the app must ask rather than pick.
 *
 * Guessing between two close matches means silently rewriting a price on the
 * wrong line, which is the failure this whole feature has to avoid.
 */
export function isAmbiguous(matches: LineMatch[]): boolean {
  if (matches.length < 2) return false;
  return matches[0].score - matches[1].score < AMBIGUOUS_WITHIN;
}
