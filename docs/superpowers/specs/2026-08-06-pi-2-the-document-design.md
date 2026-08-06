# PI-2 — The document

*Design, 2026-08-06. Branch `feature/Vision_Draft`.*

## Problem

The customer view prints a table of items and three totals. That is a price
list, not a quotation. It carries nothing that lets a customer act on it or
refer back to it: no name, no address, no date, no number, no validity, no
terms. The rupee symbol appears on the home screen but not on the document's
own totals. And any quantity with a decimal point — the normal case for wire
and cable, sold by the metre — is silently truncated to an integer before the
money is calculated.

## Scope

Five changes, all from the PI-2 list in `CLAUDE.md`:

1. Customer name, address and phone on the document
2. Date and quote number
3. Validity period and terms, stored with company settings
4. Consistent `₹`
5. Fractional quantities (known bug #5)

Explicitly **out** of scope: HSN codes, a per-GST-rate breakup table, per-quote
terms overrides, sequential quote numbering, and cascading quote deletion
(bug #6 — that is PI-4.4).

---

## 1. Quote number

`Q-260806-1423` — the date and time the quote was created, `Q-YYMMDD-HHMM`.

A new pure function in `format.ts`:

```ts
/** "Q-260806-1423" — derived from the quote's creation time, so it never changes. */
export function quoteNumber(ts: number): string
```

Local device time. Returns `""` for a falsy timestamp so nothing renders rather
than printing `Q-NaN`.

**Why derived rather than sequential.** A sequential counter needs either a
counter document (a write that can fail offline, on an app whose whole PI-1
premise is that nothing fails offline) or a scan of every existing quote at
save time. Deriving from `createdAt` needs neither, cannot collide, and is
stable for the life of the quote.

### Making the printed number match the stored one

`saveQuote` currently stamps `createdAt = Date.now()` at save time. The customer
view is reachable from an unsaved quote, so a PDF shared before saving would
carry a different number than the quote that is eventually stored.

Fix: the editor mints the timestamp once, when it opens.

```ts
// QuoteEditor
const [createdAt] = useState(() => existingQuote?.createdAt ?? Date.now());
```

`saveQuote` takes it as a seventh, optional parameter, used only in the
new-document branch:

```ts
async function saveQuote(
  customerName: string,
  name: string,
  lines: UILine[],
  totalSale: number,
  status: QuoteStatus,
  existingId?: string,
  createdAt?: number,   // new — the editor's minted time, so the printed
                        // quote number matches the stored document
): Promise<SaveResult>
```

`updatedAt` keeps using `Date.now()`. The update branch does not touch
`createdAt`, so re-saving an old quote never renumbers it.

## 2. Document header

`CustomerView` gains three props: `customerAddress?`, `customerPhone?`,
`createdAt`. `Customer` already carries address and phone from Firestore —
they simply never reach the component today. Props stay discrete strings rather
than a whole `Customer` object: the type-system firewall that keeps cost and
profit out of the customer view is easier to see when the component's inputs
are spelled out one by one.

`QuoteEditor` also stops passing `quoteName={quoteName || "Quotation"}` and
passes the raw `quoteName`. `CustomerView` already defaults the share title to
`"Quotation"` internally, so the sentinel string is not needed — and with it
gone, "is there a subject line?" is just "is `quoteName` non-empty?".

### Rendered layout

```
[logo]  Sri Lakshmi Electricals              QUOTATION
        Main Road, Guntur              No.   Q-260806-1423
        📞 98765 43210 · GSTIN …       Date  06 Aug 2026
─────────────────────────────────────────────────────────
To
Ramesh Electricals
Shop 4, Brodipet, Guntur
📞 98765 43210

Subject: 3BHK wiring materials

   … item table …
   … totals …

Valid for 15 days from the date above.

Terms
• Payment: 50% advance, balance on delivery
• Delivery: 3–4 working days
```

DOM inside the existing `.cv-doc` (the node `sharePdf` rasterises):

| Element | New? | Renders when |
|---|---|---|
| `.cv-company-header` | existing | any company field is set |
| `.cv-divider` | existing | always |
| `.cv-docmeta` — `h1.cv-title` + No./Date block | wraps the existing `h1` | always; No. and Date each hide if empty |
| `.cv-billto` | new | `customerName` is non-empty; address and phone lines each hide when blank |
| `.cv-subject` | new | `quoteName` is non-empty |
| `table.cv-table` | existing | always |
| `.cv-totals` | existing | always |
| `.cv-terms` | new | `company.validity` or `company.terms` is non-empty |

Every new field hides when empty, so a customer with no address on file still
prints a clean document. Styling uses the tokens in `index.css` — no new hex
values, no hardcoded px.

The No./Date block is `CustomerView` calling `quoteNumber(createdAt)` and the
existing `formatDate(createdAt)` — both hide when the helper returns `""`, which
is the only way either can be blank.

## 3. Validity and terms

`CompanySettings` gains two fields:

```ts
validity: string;   // "Valid for 15 days from the date above."
terms: string;      // free multi-line block
```

Both default to `""` and live in localStorage with the rest of the company
details. `CompanySettings.tsx` gets a `validity` text input and a `terms`
textarea — the existing `Field` helper is input-only, so a sibling `TextArea`
helper goes next to it.

Terms render with `white-space: pre-line` so Dad's own line breaks survive
into the PDF.

These are global defaults, not per-quote. If a quote ever needs its own terms,
that is a later change to the quote document — not something to build now.

## 4. Consistent `₹`

```ts
/** "₹1,02,23,096" — the same grouping as formatINR with the symbol attached. */
export function formatMoney(n: number, decimals = 0): string
```

The sign goes outside the symbol: `formatMoney(-5)` is `-₹5`, not `₹-5`.

Applied to every money value on the document — list price, rate, amount,
subtotal, GST, grand total — and swapped into the three places that hand-prepend
the symbol today: `HomeScreen.tsx:207`, `CustomerScreen.tsx:147`,
`CustomerScreen.tsx:63`. `formatINR` itself is untouched, so the nine existing
format tests stand as they are.

`HomeScreen.tsx:113` keeps `"₹" + formatINRShort(...)` — that is the compact
lakh/crore form, a different function, and not worth a second helper.

The PDF is an html2canvas raster of the DOM, so the `₹` glyph reaches the file
exactly as it renders on screen. No jsPDF font work is involved.

## 5. Fractional quantities (bug #5)

`parseInt` → `parseFloat` at five sites:

| Site | What it feeds |
|---|---|
| `QuoteEditor.tsx:46` (`toLineInput`) | **the calc engine** — the one that corrupts money |
| `QuoteEditor.tsx:263` (`customerLines`) | the qty column on the document |
| `QuoteEditor.tsx:565` (`ItemRow`) | the collapsed row summary |
| `ImageReader.tsx:209` | qty edited in the image-confirmation list |
| `VoiceReader.tsx:199` | qty edited in the voice-confirmation list |

The three qty inputs (`QuoteEditor.tsx:668`, `ImageReader.tsx:208`,
`VoiceReader.tsx:197`) move from `inputMode="numeric"` to `inputMode="decimal"`
so the phone keypad offers a decimal point.

No display helper for quantities. Qty is a single `parseFloat` with no
arithmetic performed on it, so `2.5` renders as `2.5` — there are no floating
point artifacts to guard against.

The engine needs no change: `Math.round(resolvedSell * qty)` already handles a
fractional multiplier, and per-line rounding stays exactly as it is.

## Testing

Tests stay `environment: 'node'`, so they cover the pure functions only.

**`format.test.ts`**
- `quoteNumber` — a known timestamp produces the expected string; single-digit
  month, day, hour and minute all pad to two digits; `0` returns `""`
- `formatMoney` — zero, a lakh-grouped value, two decimals, and a negative
  rendering as `-₹5`

**`engine.test.ts`**
- 2.5 m at ₹48 is ₹120, not ₹96 (the bug, stated as a test)
- a fractional qty against a discount-resolved rate, checking the rounding lands
  where per-line rounding says it should

**Manual, in a browser** — the document layout itself. No component tests: the
suite would need a jsdom switch in `vite.config.ts` first, and a manual check
honestly reported beats a half-configured setup that claims coverage it does
not have. What gets checked by hand:

- a full document — company header, To block, subject, No./Date, terms
- a bare document — no company details, customer with no address, no quote name,
  no terms — everything empty hides, nothing prints as `undefined` or a stray label
- a quote shared as PDF **before** its first save carries the same number as the
  quote that is then saved
- 2.5 m of wire priced correctly end to end, from the qty field to the grand total

## Files touched

```
src/format.ts              quoteNumber, formatMoney
src/format.test.ts         tests for both
src/useCompanySettings.ts  validity, terms
src/CompanySettings.tsx    validity input, terms textarea, TextArea helper
src/CustomerView.tsx       header block, To block, subject, terms, ₹ on money
src/CustomerView.css       styling for the new blocks (tokens only)
src/QuoteEditor.tsx        minted createdAt, new props, 3× parseFloat, inputMode
src/useQuotes.ts           saveQuote takes createdAt
src/ImageReader.tsx        parseFloat + inputMode
src/VoiceReader.tsx        parseFloat + inputMode
src/HomeScreen.tsx         formatMoney
src/CustomerScreen.tsx     formatMoney
src/calc/engine.test.ts    fractional qty tests
CLAUDE.md                  PI-2 → WHAT IS DONE, drop bug #5
```

`CLAUDE.md` moves in the same commit as the code, per its own rule.
