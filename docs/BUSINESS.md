# Business domain

What the app is modeling, in plain terms — so numbers in the code aren't
misread.

## Who this is for

Dad: an electrical materials supplier / middleman. He takes customer orders,
buys the materials from vendors at a discount off a published list price,
and supplies them to the customer at his own rate. Non-technical end user —
every screen needs to stay mobile-first with large touch targets, and work
comfortably for a Telugu-speaking user (voice input and item names in
particular).

## How profit actually works

**Profit = gap between what Dad pays a vendor and what he charges the
customer.** It is pre-GST — GST is collected from the customer and paid to
the vendor/government, it never belongs to Dad and must never be counted as
profit. This is enforced in the calc engine (`src/calc/engine.ts`):
`lineProfit = lineSaleTotal - lineCostTotal`, computed before GST is added.

## Discounts compound, they don't add

Vendors quote a list price and one or more stacked discounts, e.g.
"64.7% + 2% off list". These compound multiplicatively, not additively:
```
resolvedPrice = listPrice × (1 − d1) × (1 − d2) × …
```
e.g. `17835 × (1 − 0.647) × (1 − 0.02) = 6169.84`. This is true on both the
cost side (what Dad pays the vendor) and the sell side (what he charges the
customer, when he quotes a discount off a list price instead of a flat
rate). Getting this wrong (adding instead of compounding) silently
overstates Dad's cost and understates his real margin.

## Two ways to price a line, either side

A line's cost and sell can each independently be:
- **Discount mode** — a list price + one or two discount percentages.
- **Direct mode** — a flat rate entered directly, no list price involved.

Dad mixes these freely — e.g. cost via discount off a vendor's price list,
sell as a round direct rate he's decided to charge.

## GST

Pass-through only, never profit. Default 18%, editable per line (some
materials carry different GST rates). Computed on the sale total, added on
top for the customer-facing grand total.

## Rounding (tunable — not yet fully confirmed)

Cost-side rounding sequence is the one piece of the calc engine not yet
locked down — see the "Rounding note" in `CLAUDE.md` and the comment in
`src/calc/engine.ts` (`resolvePrice`). Sell-side numbers already match
exactly for clean direct rates. Don't spend time forcing cost totals to the
exact rupee until this is confirmed against a real quote from Dad.

## Why no inventory / product catalog existed until now

The original app deliberately had no persistent item list — every quote was
typed from scratch. The Pricing module (see [pricing.md](pricing.md))
changes this: a real catalog, fed by photographing vendor price lists, that
Quotations and Billing both pull from. This is additive — manual entry for
one-off items stays available.
