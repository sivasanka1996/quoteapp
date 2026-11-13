# Billing

## Status
Built — Step 6 in [ROADMAP.md](ROADMAP.md).

## What it does
Invoices, either created standalone (a walk-in sale with no prior quote) or
converted from an accepted quote. An invoice is structurally the same thing
as a quote — same line items, same cost/sell/discount/GST math, same
Pricing-catalog autocomplete, same customer-facing printable/shareable
document — with two differences: it tracks **payment status**
(unpaid/partial/paid) instead of quote status, and it carries an
**invoice number**. Billing has its own customer list (shared `customers`
collection with Quotations — one business, one customer directory) and its
own per-customer invoice history, structured exactly like Quotations'
home → customer → editor flow.

"Convert to Invoice" appears as a `→ Invoice` button on any **accepted**
quote row in Quotations' `CustomerScreen.tsx`. Tapping it hands that
quote's line items to a brand-new invoice (pre-filled, not yet saved) —
the quote itself is untouched, so converting twice just makes two
invoices.

## Key files — and where each piece came from
Billing was built by reusing Quotations' line-items editor rather than
forking it from scratch. This is the exact code map, so it's traceable
later:

| Billing file | What it is | Reused from |
|---|---|---|
| `src/billing/InvoiceEditor.tsx` | The invoice editor screen (top bar, items list, blanket discount, payment status, summary/profit cards, save) | Line-for-line structural copy of `src/quotations/QuoteEditor.tsx`, with `useQuotes`→`useInvoices`, `QuoteStatus`→`PaymentStatus`, `StatusPicker`→`PaymentStatusPicker`; both now build on the same shared pieces below |
| `src/billing/BillingHomeScreen.tsx` | Customer list, rolled up by invoice count/total/unpaid | Structural copy of `src/quotations/HomeScreen.tsx`; reuses its `HomeScreen.css` classes (`home-*`) directly — see "Decisions made" |
| `src/billing/BillingCustomerScreen.tsx` | One customer's invoice list, filterable by payment status, "+ New Invoice" | Structural copy of `src/quotations/CustomerScreen.tsx`; reuses its `CustomerScreen.css` classes (`cs-*`) directly |
| `src/shared/LineItemsEditor.tsx` | `LineRow`, `LineEditorSheet`, `PriceSide`/`SidePatch`, `Row`, icons (Pencil/Trash/Plus/Camera/Mic) | **Extracted out of** `QuoteEditor.tsx` in Step 5 (this was "export PriceSide" living alongside the component before; now a standalone module both editors import). Still reuses `QuoteEditor.css`'s `qe-*` classes — unmoved, since `QuoteEditor.tsx` already bundles it globally |
| `src/shared/lineHelpers.ts` | `blankLine`, `toLineInput`, `costPatchFrom`, `catalogMatchFor`, `discountLabel`, `applyBlanket`, `Blanket`/`BlanketSide` | **Extracted out of** `QuoteEditor.tsx` in Step 5, split into its own file (not `LineItemsEditor.tsx`) because these are plain functions, not components — `react-refresh/only-export-components` forces that split, same reason `priceMode.ts` exists |
| `src/shared/useInvoices.ts` | `useInvoices(customerId)` CRUD + `useAllInvoices()` | New — mirrors `src/shared/useQuotes.ts` field-for-field |
| `src/quotations/CustomerView.tsx` | `documentTitle` ("Invoice") + `invoiceNumber` props on the existing customer-facing document | Two props added to the existing component — nothing else about it changed |
| `src/shared/StatusBadge.tsx` / `.css` | `PaymentStatusBadge`, `PaymentStatusPicker` | New functions added alongside the existing `StatusBadge`/`StatusPicker` — same file, same pattern, existing quote-status code untouched |
| `src/dashboard/Dashboard.tsx` | "Unpaid Invoices" stat tile; Billing section tile enabled (was `disabled` with "coming soon") | Existing file, additive changes only |
| `src/AppRouter.tsx` | `billing-home` / `billing-customer` / `billing-invoice-new` / `billing-invoice` routes, `pendingNewInvoiceItems`/`pendingConvert` hand-off state | Existing file, mirrors the `quotations-*` route block added alongside it |

See [quotations.md](quotations.md)'s own "Key files" for what Step 5 left
behind in `QuoteEditor.tsx` itself (now much shorter — just the screen
shell, wired to the shared pieces above).

## Decisions made
- **Routes mirror Quotations exactly**: `/billing`, `/billing/customer/:id`,
  `/billing/customer/:id/invoice/new`, `/billing/customer/:id/invoice/:id` —
  same shape as `/quotation/...`, same "stale customer id in the URL falls
  back to that flow's home list" handling in `AppRouter.tsx`.
- **`BillingHomeScreen`/`BillingCustomerScreen` are sibling files, not a
  `kind: "quotes" | "invoices"` prop on `HomeScreen`/`CustomerScreen`** —
  the original plan (see the plan file referenced in ROADMAP history)
  suggested the prop approach to avoid duplication. That was reconsidered
  during implementation: `HomeScreen.tsx`/`CustomerScreen.tsx` are live in
  production and this session has no browser to visually re-verify
  Quotations after retrofitting them, so the lower-risk path — new files
  that reuse the existing CSS classes and hook patterns, zero edits to the
  already-working screens — won out over the smaller diff. The actual
  line-items *editor* (the part with real logic worth not duplicating) is
  still shared via `LineItemsEditor.tsx`/`lineHelpers.ts`; what's
  duplicated is comparatively simple list-screen chrome.
- **Invoice numbering is a placeholder**: `INV-YYYYMMDD-NN`, where `NN` is
  "how many invoices exist today" read fresh via a Firestore query at save
  time (`nextInvoiceNumber()` in `useInvoices.ts`), not a real atomic
  counter. Two saves in the same instant could in principle race to the
  same number — acceptable for Dad's actual volume (one shop, not
  concurrent cashiers), flagged here and inline in the code if it ever
  needs to become a real sequence.
- **Payment status reuses the quote-status color system**: `--pay-unpaid`
  aliases `--st-declined` (red), `--pay-partial` aliases `--idea-building`
  (amber), `--pay-paid` aliases `--st-accepted` (green) — see `index.css`.
  Same pattern `IdeaStatus` already used to borrow quote-status colors
  rather than inventing a new palette.
- **"Convert to Invoice" only appears on accepted quotes**, and converting
  doesn't mutate or delete the quote — it's a one-way copy of line items
  into a new, unsaved invoice. Converting the same quote twice is possible
  and makes two invoices; nothing currently warns about that.
- **Payment status, unlike quote status, has no "pending work" concept** —
  an invoice is either not fully paid or fully paid. `unpaid`/`partial` both
  count toward the Dashboard's "Unpaid Invoices" total.

## Open questions / not yet decided
- No UI yet warns if the same accepted quote is converted to an invoice
  more than once.
- Invoice numbering collision risk under concurrent saves (see "Decisions
  made") — revisit if Dad ever has more than one person billing at once.
- No partial-payment amount is tracked — `partial` is a flag, not a running
  balance (e.g. "₹3,000 of ₹10,000 paid"). Add if Dad asks for it.
- Whether an invoice should be lockable/read-only once marked `paid`, to
  stop accidental edits after the fact.
