# Pricing

## Status
Built — Step 3 in [ROADMAP.md](ROADMAP.md).

## What it does
A persistent catalog of items with their **vendor cost only** — Dad's prices
change often (new vendor price lists, multiple brands per item), so the
catalog exists to avoid re-typing cost discount chains, not to duplicate
sell-side pricing. Sell price to the customer is still decided per-quote,
using the existing discount tool in `QuoteEditor.tsx` — the catalog has no
sell fields at all. Items can be added by hand or in bulk by photographing a
vendor price list — reuses the existing image-reading pipeline
(`src/readImage.ts` + `ImageReaderPanel`) unchanged, just pointed at the
catalog instead of a quote's line items.

Each catalog entry is one item **as sold by one brand** — if the same item
comes in multiple brands (e.g. wire from Finolex vs. Polycab) at different
costs, that's two separate catalog rows, distinguished by the `brand` field.
There are no quantity-based price tiers — one cost per item+brand, full
stop; this was a deliberate simplification after the first design (which
had cost *and* sell, each with their own discount chains) turned out to be
solving a problem Dad doesn't have.

## Key files
- `src/pricing/usePricing.ts` — CRUD against the `items` collection (see
  [DATA_MODEL.md](DATA_MODEL.md)), same shape as `src/shared/useCustomers.ts`,
  plus `mergeFromImage()` for bulk updates from a photographed price list
- `src/pricing/PricingScreen.tsx` + `.css` — searchable catalog list, "+ Add
  Item" sheet, "Upload image" button
- `src/shared/priceMode.ts` — `toPriceMode()`/`buildDiscountExpr()`, pulled
  out of `QuoteEditor.tsx` so both it and `PricingScreen.tsx` can resolve a
  cost from the same string fields without duplicating the logic
- `src/quotations/QuoteEditor.tsx`'s exported `PriceSide` component — reused
  as-is for the cost input in the catalog's edit sheet
- `src/shared/ImageReader.tsx` — reused as-is
- `src/calc/engine.ts`'s `resolvePrice()` — reused as-is to show resolved
  cost per catalog item

## Decisions made
- Cost only, no sell fields — sell/discount stays entirely in the quote tool.
- Brand is a free-text field per item, not a shared/managed brand list —
  simplest thing that works; revisit if brand names start drifting
  (typos creating near-duplicate rows).
- No quantity-based price tiers.
- **Brand for an image upload is declared once per batch, not read off the
  photo.** A vendor price list is almost always one brand throughout, and
  the brand name often isn't even printed next to each line item, so asking
  Gemini to extract it per-row would be guessing. Instead, uploading asks
  "Whose price list is this?" once before opening the camera/gallery picker,
  and every item from that photo is tagged with that one brand.
- Merge behavior for a photographed price list: match by exact item
  **name + that upload's brand** (both trimmed, case-insensitive) → update
  that row's cost rate; no match → insert a new row with that brand. A
  second brand's price list for the same item name now correctly creates a
  second row instead of overwriting the first.

## Open questions / not yet decided
- Nothing stops Dad from typing the same brand two different ways (e.g.
  "Finolex" vs "finolex ") on different uploads — the match is
  case/whitespace-insensitive so that specific case is fine, but genuine
  spelling variants ("Finolex" vs "Finolex Industries") would still create
  duplicate rows. No brand picker/autocomplete yet.
- Whether items need a category/grouping as the catalog grows.
