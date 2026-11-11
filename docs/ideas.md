# Idea Tracker

## Status
Built — Step 1 in [ROADMAP.md](ROADMAP.md).

## What it does
A dev-facing page (not part of Dad's business flow) for tracking the
build-out of this project itself: a text box to drop in a new idea, and a
status per idea that moves Idea → Finalized → Building → Built. Open to
anyone for now (no auth) — same `allow read, write: if true` as every other
collection today; gets locked down alongside the rest before handover to
Dad.

This is intentionally separate from the `docs/` files: Idea Tracker is for
quick, low-friction capture of raw ideas and their status day-to-day;
`docs/*.md` is the structured, maintained record of what's actually been
designed and built.

## Key files
- `src/useIdeas.ts` — `onSnapshot` on `ideas` (sorted client-side by
  `createdAt` desc, same no-composite-index approach as `useQuotes.ts`) +
  `addIdea`, `setStatus`, `deleteIdea`
- `src/IdeaTracker.tsx` + `.css` — add box, status filter, flat list of idea
  rows, each with an inline status picker and delete-with-confirm
- `src/types.ts` — `IdeaStatus`, `IDEA_STATUSES`, `IDEA_STATUS_LABEL`,
  `IdeaDoc`
- `src/AppHeader.tsx` — lightbulb icon in the header opens the tracker from
  anywhere
- `src/AppRouter.tsx` — added an `"ideas"` screen alongside
  `home`/`customer`/`quote`
- `src/index.css` — added `--idea-*` color tokens (reuses the draft/sent/
  accepted quote-status colors for idea/finalized/built, adds one new amber
  pair for building)

## Decisions made
- Four statuses: Idea → Finalized → Building → Built.
- No auth gate for now; reachable by anyone who opens the app.
- Flat list with a status filter (dropdown, same pattern as
  `CustomerScreen.tsx`'s quote filter) rather than a four-column board —
  simpler for a single-user tool with a handful of ideas at a time.
- Status is changed inline per row via a compact picker (not a detail
  sheet) — ideas move stage often enough that a tap-through would add
  friction for no benefit at this scale.

## Open questions / not yet decided
- None currently — revisit the board-vs-list layout if the idea count grows
  large enough that a flat list stops being scannable.
