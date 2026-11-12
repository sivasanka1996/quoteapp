# Idea Tracker

## Status
Built — Step 1 in [ROADMAP.md](ROADMAP.md).

## What it does
A dev-facing page (not part of Dad's business flow) for tracking the
build-out of this project itself: a text box to drop in a new idea tagged to
one of the five app areas (Dashboard / Pricing / Quotations / Billing /
General), and a status per idea that moves Idea → Finalized → Building →
Built. The list is grouped by service so related ideas sit together, with a
status filter on top of that. Open to anyone for now (no auth) — same
`allow read, write: if true` as every other collection today; gets locked
down alongside the rest before handover to Dad.

This is intentionally separate from the `docs/` files: Idea Tracker is for
quick, low-friction capture of raw ideas and their status day-to-day;
`docs/*.md` is the structured, maintained record of what's actually been
designed and built.

## Key files
- `src/ideas/useIdeas.ts` — `onSnapshot` on `ideas` (sorted client-side by
  `createdAt` desc, same no-composite-index approach as `useQuotes.ts`) +
  `addIdea`, `setStatus`, `setService`, `deleteIdea`
- `src/ideas/IdeaTracker.tsx` + `.css` — add box (text + service picker),
  status filter, idea rows grouped into per-service sections, each row with
  an inline status picker, a service dropdown to re-group it, and
  delete-with-confirm
- `src/types.ts` — `IdeaStatus`/`IDEA_STATUSES`/`IDEA_STATUS_LABEL`,
  `IdeaService`/`IDEA_SERVICES`/`IDEA_SERVICE_LABEL`, `IdeaDoc`,
  `ideaService(idea)` (defaults missing `service` to `"general"`)
- `src/shared/AppHeader.tsx` — lightbulb icon in the header opens the tracker
  from anywhere
- `src/AppRouter.tsx` — `/ideas` route renders this screen
- `src/index.css` — added `--idea-*` color tokens (reuses the draft/sent/
  accepted quote-status colors for idea/finalized/built, adds one new amber
  pair for building)

## Decisions made
- Four statuses: Idea → Finalized → Building → Built.
- Five services, matching the app's module areas: Dashboard, Pricing,
  Quotations, Billing, General (cross-cutting items — auth, handover
  checklist — that aren't specific to one module).
- No auth gate for now; reachable by anyone who opens the app.
- Grouped-by-service list with a status filter (dropdown, same pattern as
  `CustomerScreen.tsx`'s quote filter) rather than a four-column status
  board — grouping by service matters more day-to-day than grouping by
  status, since work tends to happen one module at a time.
- Status and service are both changed inline per row via compact
  pickers (not a detail sheet) — ideas move often enough that a tap-through
  would add friction for no benefit at this scale.
- `service` is optional on `IdeaDoc` so older docs (written before this
  field existed) don't need a migration to keep loading — `ideaService()`
  falls back to `"general"`.

## Open questions / not yet decided
- None currently.
