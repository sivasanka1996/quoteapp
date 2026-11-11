# Pricing

## Status
Not started — Step 3 in [ROADMAP.md](ROADMAP.md).

## What it does (planned)
A persistent catalog of items with their cost/sell pricing, so Dad doesn't
retype the same vendor discount chains into every quote. Items can be added
by hand or in bulk by photographing a vendor's price list — reusing the
existing image-reading pipeline (`src/readImage.ts` + `ImageReaderPanel`)
unchanged, just pointed at the catalog instead of a quote's line items.

## Key files (planned)
- `src/usePricing.ts` — new, same CRUD shape as `src/useCustomers.ts`,
  against the new `items` collection (see [DATA_MODEL.md](DATA_MODEL.md))
- `src/PricingScreen.tsx` + `.css` — new
- `src/ImageReader.tsx` — reused as-is; its `onAdd: (items: ReadItem[]) =>
  void` callback already fits, no changes needed
- `src/calc/engine.ts`'s `resolvePrice()` — reused as-is to show resolved
  cost/sell per catalog item

## Decisions made
- Catalog items share the same cost/sell field shape as `UILine` (minus
  qty/GST), so the same `PriceSide` input component can be reused for
  editing them.

## Open questions / not yet decided
- Merge behavior when a photographed price list includes an item that
  already exists in the catalog (match by name → update, vs. always
  insert).
- Whether items need a category/grouping as the catalog grows.
