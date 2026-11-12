# Quotations

## Status
Built — this is the original app, live in production.

## What it does
Lets Dad build a quote for a customer: add line items by hand, by photo
(image reading), or by voice; price each line on either the cost or sell
side as a vendor discount chain or a direct rate; see live totals (cost,
sale, GST, profit) as he edits; mark the quote's status (draft / sent /
accepted / declined); and switch to a customer-facing view that hides
cost/profit, for printing or sharing as a PDF over WhatsApp. Line items can
also be matched against the Pricing catalog to pull in cost automatically
(Step 4) — see "Decisions made" below.

## Key files
- `src/quotations/HomeScreen.tsx` — customer search/add/list (entry point)
- `src/quotations/CustomerScreen.tsx` — a customer's quote history, status
  filter
- `src/quotations/QuoteEditor.tsx` — the editor: line rows, bottom-sheet line
  editor, blanket discount panel, profit summary, save; also where the
  catalog autocomplete and image/voice cost auto-fill live (`LineEditorSheet`,
  `handleAddFromImage`, `handleAddFromVoice`)
- `src/quotations/CustomerView.tsx` — the customer-facing document
  (print/share)
- `src/calc/engine.ts` — pure pricing/profit/GST math, no UI, no network
- `src/shared/useQuotes.ts` — Firestore CRUD, `useQuotes(customerId)` +
  `useAllQuotes()` for aggregate stats
- `src/shared/StatusBadge.tsx` — status pill + picker
- `src/shared/matchCatalog.ts` — `findMatches()` (name-contains, for the
  autocomplete dropdown) and `exactMatch()` (name-exact, for image/voice
  auto-fill), both against `usePricing()`'s items
- `src/sharePdf.ts`, `src/shared/ImageReader.tsx`, `src/shared/VoiceReader.tsx`
  — shared utilities also used elsewhere
- `src/AppRouter.tsx` — resolves `/quotation`, `/quotation/customer/:id`, and
  `/quotation/customer/:id/quote/:id` into this flow's screens; see
  [dashboard.md](dashboard.md)'s Key files for the routing mechanism

## Decisions made
- Discounts compound (`list × (1−d1) × (1−d2)`), never add — see
  [BUSINESS.md](../docs/BUSINESS.md).
- Profit is pre-GST; GST is pass-through and never enters it.
- Per-line rounding happens before summing totals (correctness requirement,
  not cosmetic) — see `src/calc/engine.ts`.
- Customer PDF is a rasterized image of the on-screen document (html2canvas
  → jsPDF), not generated text, specifically because jsPDF's built-in fonts
  can't render Telugu item names at all.
- **Catalog autocomplete (Step 4, manual typing):** the line editor's item
  name field shows up to 5 matching catalog items as Dad types (name
  contains, case-insensitive). Picking one fills the line's cost fields
  (`costMode/costList/costDisc1/costDisc2/costRate`) straight from the
  catalog entry — same shape, direct copy. Sell side stays manual, as
  always; the catalog has no sell fields (see [pricing.md](pricing.md)).
- **Catalog auto-fill for image items is Gemini-matched, not exact-text:**
  the full catalog (id+name) is sent to the image-reading worker alongside
  the photo, and Gemini returns a `catalogId` per scanned line when it finds
  a confident match *by meaning* — tolerant of OCR mistakes, abbreviations,
  and formatting (`sqmm` vs `sq mm`). `catalogMatchFor()` in
  `QuoteEditor.tsx` prefers that id, falling back to `exactMatch()` (plain
  name equality) only when Gemini didn't return one. See
  [pricing.md](pricing.md) for the worker-side prompt change
  (`cf-worker/image-reader.js`'s `buildPrompt()`).
- **Catalog auto-fill for voice items stays exact-name-only** — voice
  parsing doesn't go through Gemini, so there's no semantic match available
  there; `exactMatch()` is used directly, same as before.
- Both paths reuse `PriceSide`'s cost fields verbatim; there's no separate
  "catalog price" concept — once picked, it's just the line's cost, editable
  afterward like anything typed by hand.

## Open questions / not yet decided
- Brand-name normalization (typos creating near-duplicate catalog rows)
  affects matching here too — same open question as in
  [pricing.md](pricing.md).
- Cost-side rounding sequence is tunable, not fully confirmed against a real
  quote from Dad — see [BUSINESS.md](BUSINESS.md).
- Voice input can only add items, not edit existing lines; no undo on the
  last voice action.
