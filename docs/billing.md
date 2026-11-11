# Billing

## Status
Not started — Step 6 in [ROADMAP.md](ROADMAP.md).

## What it does (planned)
Generates actual invoices, as opposed to quotations. An invoice can be
created two ways: converted from an accepted quote ("Convert to Invoice"
button in the quote's customer history), or started standalone from Billing
directly for a walk-in sale with no prior quote. Each invoice tracks a
payment status (unpaid / partial / paid) instead of a quote's draft/sent/
accepted/declined status.

## Key files (planned)
- `src/useInvoices.ts` — new, mirrors `src/useQuotes.ts`
- `src/InvoiceEditor.tsx` + `.css` — new, same shell as `QuoteEditor.tsx`
- `src/BillingScreen.tsx` — new, thin wrapper reusing the
  `HomeScreen`/`CustomerScreen` customer-browsing pattern (shared customer
  directory — one customer list for the whole business, not duplicated per
  module) with a `kind: "quotes" | "invoices"` prop
- `src/LineItemsEditor.tsx` — shared module extracted out of
  `QuoteEditor.tsx` (Step 5) so the line-row list, bottom-sheet line editor,
  and `PriceSide` component aren't duplicated between quotes and invoices
- `src/CustomerView.tsx` — reused with two new optional props:
  `documentTitle` ("Quotation" vs "Invoice") and `invoiceNumber`

## Decisions made
- Invoices can be created both ways (standalone and converted) — not
  restricted to only following a quote.
- Invoice numbering: placeholder scheme for now —
  `INV-YYYYMMDD-NN`, computed client-side from that day's existing invoice
  count. Explicitly temporary; Dad/Siva haven't decided on a real scheme
  (e.g. a strictly sequential atomic counter, which GST invoices
  conventionally want) — flagged inline in the code, see
  [CONFIG.md](CONFIG.md) note and `src/useInvoices.ts` once written.

## Open questions / not yet decided
- Real invoice numbering scheme (deferred, see above).
- Whether a quote converted to an invoice stays independently editable
  afterward, or whether edits should be able to flow back.
