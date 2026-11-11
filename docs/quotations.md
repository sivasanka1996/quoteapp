# Quotations

## Status
Built — this is the original app, live in production.

## What it does
Lets Dad build a quote for a customer: add line items by hand, by photo
(image reading), or by voice; price each line on either the cost or sell
side as a vendor discount chain or a direct rate; see live totals (cost,
sale, GST, profit) as he edits; mark the quote's status (draft / sent /
accepted / declined); and switch to a customer-facing view that hides
cost/profit, for printing or sharing as a PDF over WhatsApp.

## Key files
- `src/HomeScreen.tsx` — customer search/add/list (entry point)
- `src/CustomerScreen.tsx` — a customer's quote history, status filter
- `src/QuoteEditor.tsx` — the editor: line rows, bottom-sheet line editor,
  blanket discount panel, profit summary, save
- `src/CustomerView.tsx` — the customer-facing document (print/share)
- `src/calc/engine.ts` — pure pricing/profit/GST math, no UI, no network
- `src/useQuotes.ts` — Firestore CRUD, `useQuotes(customerId)` +
  `useAllQuotes()` for aggregate stats
- `src/StatusBadge.tsx` — status pill + picker
- `src/sharePdf.ts`, `src/ImageReader.tsx`, `src/VoiceReader.tsx` — shared
  utilities also used elsewhere

## Decisions made
- Discounts compound (`list × (1−d1) × (1−d2)`), never add — see
  [BUSINESS.md](../docs/BUSINESS.md).
- Profit is pre-GST; GST is pass-through and never enters it.
- Per-line rounding happens before summing totals (correctness requirement,
  not cosmetic) — see `src/calc/engine.ts`.
- Customer PDF is a rasterized image of the on-screen document (html2canvas
  → jsPDF), not generated text, specifically because jsPDF's built-in fonts
  can't render Telugu item names at all.

## Open questions / not yet decided
- Catalog integration: once Pricing (Step 3) exists, the line-item name
  field should offer autocomplete against the catalog and prefill cost/sell
  — not built yet (Step 4 in [ROADMAP.md](ROADMAP.md)).
- Cost-side rounding sequence is tunable, not fully confirmed against a real
  quote from Dad — see [BUSINESS.md](BUSINESS.md).
- Voice input can only add items, not edit existing lines; no undo on the
  last voice action.
