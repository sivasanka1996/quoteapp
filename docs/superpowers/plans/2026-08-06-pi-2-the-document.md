# PI-2 — The Document — Implementation Plan

> ## ✅ COMPLETE — this plan is a historical record
>
> **PI-2 shipped and was verified on 2026-08-06.**
> The unticked `- [ ]` boxes below were never ticked off as the work landed;
> they record the plan as written, **not** work outstanding. Do not pick a task
> up from here.
>
> What shipped is in [`CLAUDE.md`](../../../CLAUDE.md) under WHAT IS DONE; the
> evidence is in [`pi-1-to-4-verification.md`](../../../docs/history/pi-1-to-4-verification.md).
> Banner added 2026-08-20, when the boxes were found still reading as pending.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer-facing view from a price list into a quotation a business can act on — name, address, date, number, validity, terms, a rupee symbol on every amount, and quantities that survive a decimal point.

**Architecture:** Four pure helpers carry the new behaviour (`quoteNumber`, `formatMoney`, `parseQty`, plus the existing `formatDate`), so the logic is unit-tested in a node environment while the components stay presentational. `CustomerView` gains new blocks around the table it already renders; `QuoteEditor` gains a minted `createdAt` so the printed quote number matches the stored document.

**Tech Stack:** React 19 + Vite 8 + TypeScript, Vitest 4 (`environment: 'node'`, `npm test` runs `vitest run` — no watch mode), Firebase Firestore, html2canvas + jsPDF for the PDF.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-pi-2-the-document-design.md` — read it before starting.
- **Run `npm install` first.** `node_modules` is not committed and is often absent; without it `npm test` fails with `'vitest' is not recognized`.
- **Tests are `environment: 'node'`** (see `vite.config.ts`). Only pure functions can be tested. Do NOT add a jsdom setup to test components — a manual check honestly reported is preferred over a half-configured one.
- **Commit author must be `revan.datta132@gmail.com`.** Verify after the first commit with `git log -1 --format='%ae'`.
- **Do not `git push`.** Push to `origin` returns 403 on this machine; commit locally only.
- **Branch is `feature/Vision_Draft`.** Stay on it.
- **Cost and profit must never reach `CustomerView`.** It takes `CustomerLine[]`, which has no cost field. Do not add one.
- **CSS inside `.cv-doc` uses fixed hex** (`#1a1a1a` ink, `#555` secondary, `#eee` rules), matching its neighbours — it is a print surface. The screen-only toolbar above it uses `var(--…)` tokens. Follow whichever the block you are editing sits in.
- **Money uses the `.tnum` class** (tabular numerals) wherever digits form a column.
- **`npm run lint` must stay clean.** Removing the last use of an import means removing the import.

---

### Task 1: `quoteNumber` and `formatMoney`, and the rupee symbol everywhere

**Files:**
- Modify: `src/format.ts`
- Modify: `src/format.test.ts`
- Modify: `src/HomeScreen.tsx:5,207`
- Modify: `src/CustomerScreen.tsx:11,63,147`

**Interfaces:**
- Consumes: `formatINR(n: number, decimals?: number): string` — already in `src/format.ts`
- Produces:
  - `quoteNumber(ts: number): string` — `"Q-260806-1423"`, `""` for a falsy `ts`
  - `formatMoney(n: number, decimals?: number): string` — `"₹3,73,347"`, sign outside the symbol

- [ ] **Step 1: Write the failing tests**

Append to `src/format.test.ts`:

```typescript
describe("quoteNumber — derived from the quote's creation time", () => {
  it("builds Q-YYMMDD-HHMM", () => {
    // Built from local components so the test holds in any timezone
    expect(quoteNumber(new Date(2026, 7, 6, 14, 23).getTime())).toBe("Q-260806-1423");
  });
  it("pads single-digit month, day, hour and minute", () => {
    expect(quoteNumber(new Date(2026, 0, 2, 3, 4).getTime())).toBe("Q-260102-0304");
  });
  it("is empty when there is no timestamp", () => {
    expect(quoteNumber(0)).toBe("");
  });
});

describe("formatMoney — formatINR with the symbol", () => {
  it("prefixes the symbol", () => {
    expect(formatMoney(0)).toBe("₹0");
    expect(formatMoney(373347)).toBe("₹3,73,347");
  });
  it("keeps decimals", () => {
    expect(formatMoney(6169.84, 2)).toBe("₹6,169.84");
  });
  it("puts the sign outside the symbol", () => {
    expect(formatMoney(-5)).toBe("-₹5");
  });
});
```

Update the import at the top of the file:

```typescript
import { formatINR, formatINRShort, quoteNumber, formatMoney } from "./format";
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- format`
Expected: FAIL — `quoteNumber is not a function` / `formatMoney is not a function`

- [ ] **Step 3: Implement both helpers**

Append to `src/format.ts`:

```typescript
/**
 * "Q-260806-1423" — the date and time the quote was created.
 *
 * Derived rather than sequential: a counter needs either a counter document
 * (a write that can fail with no signal) or a scan of every quote at save
 * time. This needs neither, cannot collide, and never changes for a given
 * quote because `createdAt` never changes.
 */
export function quoteNumber(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `Q-${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** "₹3,73,347" — formatINR with the symbol. Sign goes outside: -₹5, not ₹-5. */
export function formatMoney(n: number, decimals = 0): string {
  return (n < 0 ? "-" : "") + "₹" + formatINR(Math.abs(n), decimals);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- format`
Expected: PASS — 15 tests in `format.test.ts` (9 existing + 6 new)

- [ ] **Step 5: Use the helper where the symbol is hand-prepended**

`src/HomeScreen.tsx:207` — replace:

```tsx
                      ₹{formatINR(s.total)}
```

with:

```tsx
                      {formatMoney(s.total)}
```

`src/HomeScreen.tsx:5` — `formatINR` now has no other use in this file, so swap it out:

```tsx
import { formatMoney, formatINRShort, formatDate } from "./format";
```

Leave line 113 (`"₹" + formatINRShort(...)`) exactly as it is — that is the compact lakh/crore form, a different function, and not worth a second helper.

`src/CustomerScreen.tsx:63` — replace:

```tsx
                (totalValue > 0 ? ` · ₹${formatINR(totalValue)} total value` : "")}
```

with:

```tsx
                (totalValue > 0 ? ` · ${formatMoney(totalValue)} total value` : "")}
```

`src/CustomerScreen.tsx:147` — replace:

```tsx
                    <span className="cs-row-amount tnum">₹{formatINR(q.totalSale)}</span>
```

with:

```tsx
                    <span className="cs-row-amount tnum">{formatMoney(q.totalSale)}</span>
```

`src/CustomerScreen.tsx:11` — `formatINR` now has no other use in this file either:

```tsx
import { formatMoney, formatDate } from "./format";
```

- [ ] **Step 6: Verify nothing broke**

Run: `npm test` — Expected: PASS, 58 tests
Run: `npm run lint` — Expected: clean, no unused-import errors
Run: `npm run build` — Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add src/format.ts src/format.test.ts src/HomeScreen.tsx src/CustomerScreen.tsx
git commit -m "Add quoteNumber and formatMoney, and use the symbol consistently

quoteNumber derives a quote's number from its creation time rather than a
counter — nothing to write, nothing to collide, and it never changes for a
given quote. formatMoney puts the rupee symbol in one place instead of three
hand-prepended ones.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --format='%ae'   # must print revan.datta132@gmail.com
```

---

### Task 2: Fractional quantities (known bug #5)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/types.test.ts`
- Modify: `src/calc/engine.test.ts`
- Modify: `src/QuoteEditor.tsx:46,263,565,668`
- Modify: `src/ImageReader.tsx:208-209`
- Modify: `src/VoiceReader.tsx:197,199`

**Interfaces:**
- Consumes: `UILine` from `src/types.ts`; `calcLine(input: LineInput): LineResult` from `src/calc/engine.ts`
- Produces: `parseQty(s: string): number` exported from `src/types.ts`

**Context:** wire and cable sell by the metre. `parseInt("2.5")` is `2`, so a
2.5 m line at ₹48 was billed as ₹96 instead of ₹120. The engine was never
wrong — `calcLine` always took `qty: number`. The bug is five `parseInt` calls
in the UI.

- [ ] **Step 1: Write the failing test**

Append to `src/types.test.ts`:

```typescript
describe("parseQty", () => {
  it("keeps a fractional quantity — wire sells by the metre", () => {
    expect(parseQty("2.5")).toBe(2.5);
    expect(parseQty("0.75")).toBe(0.75);
  });

  it("reads whole numbers unchanged", () => {
    expect(parseQty("402")).toBe(402);
  });

  it("is 0 for anything unreadable, as parseInt(s) || 0 was", () => {
    expect(parseQty("")).toBe(0);
    expect(parseQty("abc")).toBe(0);
  });
});
```

Add `parseQty` to the import at the top of `src/types.test.ts`:

```typescript
import {
  quoteStatus,
  seedNextId,
  hasNoCost,
  parseQty,
  type QuoteDoc,
  type UILine,
} from "./types";
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- types`
Expected: FAIL — `parseQty is not a function`

- [ ] **Step 3: Implement `parseQty`**

Append to `src/types.ts`:

```typescript
/**
 * A quantity string as a number.
 *
 * Wire and cable sell by the metre, so "2.5" has to stay 2.5. This used to be
 * `parseInt(l.qty) || 0` in five separate places, which silently billed 2.5 m
 * as 2 m. Fractional quantities were never a problem for the engine — it takes
 * `qty: number` and always has.
 */
export function parseQty(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- types`
Expected: PASS — 16 tests in `types.test.ts` (13 existing + 3 new)

- [ ] **Step 5: Lock the engine contract the UI now depends on**

Append to `src/calc/engine.test.ts`. Note: **these two pass immediately** — the
engine was always fractional-safe. They exist so a later change cannot quietly
break what the UI now relies on.

```typescript
describe("fractional quantities — wire and cable sell by the metre", () => {
  it("2.5 m at ₹48 is ₹120, not ₹96", () => {
    const r = calcLine({
      name: "2.5 sq wire",
      qty: 2.5,
      cost: { kind: "direct", rate: 40 },
      sell: { kind: "direct", rate: 48 },
      gstPct: 18,
    });
    expect(r.lineCostTotal).toBe(100);
    expect(r.lineSaleTotal).toBe(120);
    expect(r.lineProfit).toBe(20);
    expect(r.gstAmount).toBe(22); // round(120 × 0.18) = round(21.6)
  });

  it("rounds a fractional qty against a discount-resolved rate", () => {
    const r = calcLine({
      name: "1.5 sq",
      qty: 0.5,
      cost: { kind: "discount", listPrice: 17835, discountExpr: COST_DISCOUNT_EXPR },
      sell: { kind: "direct", rate: 6296 },
      gstPct: 18,
    });
    // 17835 × 0.353 × 0.98 = 6169.84 per unit; × 0.5 = 3084.92 → 3085
    expect(r.resolvedCost).toBeCloseTo(6169.84, 2);
    expect(r.lineCostTotal).toBe(3085);
    expect(r.lineSaleTotal).toBe(3148);
  });
});
```

- [ ] **Step 6: Run the engine tests**

Run: `npm test -- engine`
Expected: PASS — 23 tests (21 existing + 2 new)

- [ ] **Step 7: Replace every `parseInt` on a quantity**

`src/QuoteEditor.tsx:46` — inside `toLineInput`, the one that feeds the calc engine:

```typescript
    name: l.name, qty: parseQty(l.qty),
```

`src/QuoteEditor.tsx:263` — inside `customerLines`:

```typescript
    return { name: l.name, qty: parseQty(l.qty), listPrice, sellDisc1, sellDisc2, result: results[i] };
```

`src/QuoteEditor.tsx:565` — inside `ItemRow`:

```typescript
  const qty = parseQty(l.qty);
```

`src/QuoteEditor.tsx:9-11` — add `parseQty` to the existing import from `./types`:

```typescript
import {
  seedNextId, hasNoCost, parseQty,
  type UILine, type Customer, type QuoteDoc, type QuoteStatus,
} from "./types";
```

`src/ImageReader.tsx:209` — keep the existing `|| 0` fallback behaviour, which
`parseQty` already provides:

```tsx
                      onChange={(e) => patchItem(it._id, { qty: parseQty(e.target.value) })} />
```

`src/VoiceReader.tsx:199` — keep the existing `|| 1` fallback:

```tsx
                    onChange={(e) => setItem((p) => ({ ...p, qty: parseQty(e.target.value) || 1 }))}
```

Add the import to both files:

```typescript
import { parseQty } from "./types";
```

(In `ImageReader.tsx` and `VoiceReader.tsx` this is a new import line — put it
with the other local imports at the top.)

- [ ] **Step 8: Let the phone keypad offer a decimal point**

Three quantity inputs move from `inputMode="numeric"` to `inputMode="decimal"`:

- `src/QuoteEditor.tsx:668`
- `src/ImageReader.tsx:208`
- `src/VoiceReader.tsx:197`

```tsx
              inputMode="decimal"
```

- [ ] **Step 9: Verify**

Run: `npm test` — Expected: PASS, 63 tests
Run: `npm run lint` — Expected: clean
Run: `npm run build` — Expected: succeeds

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/types.test.ts src/calc/engine.test.ts src/QuoteEditor.tsx src/ImageReader.tsx src/VoiceReader.tsx
git commit -m "Stop truncating fractional quantities (bug #5)

Wire and cable sell by the metre. parseInt turned 2.5 m into 2 m before the
money was calculated, so a 2.5 m line at Rs 48 was billed at Rs 96 instead of
Rs 120. One tested parseQty helper replaces five parseInt calls, and the qty
inputs now offer a decimal keypad.

The engine was never the broken part — calcLine has always taken qty as a
number. Two tests pin that contract down now that the UI depends on it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Validity and terms in company settings

**Files:**
- Modify: `src/useCompanySettings.ts`
- Modify: `src/CompanySettings.tsx`
- Modify: `src/CompanySettings.css`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `CompanySettings` gains `validity: string` and `terms: string`, both defaulting to `""`. Task 5 renders them.

**Context:** these are global defaults printed on every quotation, not per-quote
fields. `load()` already spreads `defaults` over whatever is in localStorage, so
existing saved settings pick up the two new keys with no migration.

- [ ] **Step 1: Add the fields to the type and the defaults**

`src/useCompanySettings.ts` — in the `CompanySettings` interface, after `gstin`:

```typescript
  gstin: string;
  validity: string;     // "Valid for 15 days from the date above."
  terms: string;        // free multi-line block, printed under the totals
  logoDataUrl: string; // base64 data URL or ""
```

And in `defaults`:

```typescript
const defaults: CompanySettings = {
  name: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  gstin: "",
  validity: "",
  terms: "",
  logoDataUrl: "",
};
```

- [ ] **Step 2: Add a `TextArea` helper next to `Field`**

Append to `src/CompanySettings.tsx`, below the existing `Field` function:

```tsx
function TextArea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="cs-field">
      <span>{label}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
```

- [ ] **Step 3: Add the two inputs to the panel**

`src/CompanySettings.tsx` — after the GSTIN `<Field>` and before the closing
`</div>` of `cs-body`:

```tsx
          <Field
            label="Validity"
            value={settings.validity}
            placeholder="Valid for 15 days from the date above"
            onChange={(v) => onChange({ validity: v })}
          />
          <TextArea
            label="Terms"
            value={settings.terms}
            placeholder={"Payment: 50% advance, balance on delivery\nDelivery: 3–4 working days"}
            onChange={(v) => onChange({ terms: v })}
          />
```

- [ ] **Step 4: Style the textarea like the inputs**

`src/CompanySettings.css` — extend the existing `.cs-field input` rules to cover
`textarea`. Replace the two rules at lines 118-129 with:

```css
.cs-field input,
.cs-field textarea {
  padding: 11px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  width: 100%;
}
.cs-field input:focus,
.cs-field textarea:focus {
  outline: none;
  border-color: #1a1a1a;
}
.cs-field textarea {
  resize: vertical;
  min-height: 92px;
  line-height: 1.45;
}
```

- [ ] **Step 5: Verify**

Run: `npm test` — Expected: PASS, 63 tests (unchanged — no pure logic added)
Run: `npm run lint` — Expected: clean
Run: `npm run build` — Expected: succeeds

- [ ] **Step 6: Check it by hand**

Run: `npm run dev`, open the settings gear in the app header. Confirm the
Validity input and the Terms textarea appear below GSTIN, that typing in them
persists across a page reload (they save to localStorage on every keystroke),
and that the textarea keeps your line breaks.

- [ ] **Step 7: Commit**

```bash
git add src/useCompanySettings.ts src/CompanySettings.tsx src/CompanySettings.css
git commit -m "Add validity and terms to company settings

Global defaults printed on every quotation. load() already spreads the
defaults over stored settings, so existing saved company details pick up
both keys with no migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Mint `createdAt` in the editor so the printed number matches the stored one

**Files:**
- Modify: `src/useQuotes.ts:61-94`
- Modify: `src/QuoteEditor.tsx:107-113,201-208`

**Interfaces:**
- Consumes: `SaveResult { id: string; queued: boolean }` from `src/useQuotes.ts`
- Produces: `saveQuote(customerName, name, lines, totalSale, status, existingId?, createdAt?)` — a seventh optional parameter. Task 5 consumes the editor's `createdAt` state variable as a `CustomerView` prop.

**Context:** `saveQuote` stamps `createdAt = Date.now()` at save time. The
customer view is reachable from an unsaved quote, so a PDF shared before saving
would carry one number and the saved quote another. The editor mints the
timestamp once when it opens, and hands it to `saveQuote`.

The seventh positional parameter is deliberate: there is exactly one call site,
and the two optionals are `string` and `number`, so transposing them is a
compile error rather than a quote saved under the wrong id.

- [ ] **Step 1: Take `createdAt` in `saveQuote`**

`src/useQuotes.ts` — extend the signature:

```typescript
  async function saveQuote(
    customerName: string,
    name: string,
    lines: UILine[],
    totalSale: number,
    status: QuoteStatus,
    existingId?: string,
    // The editor mints this when it opens, so the quote number printed on a
    // PDF shared before the first save matches the document that gets stored.
    createdAt?: number
  ): Promise<SaveResult> {
```

- [ ] **Step 2: Use it in the new-document branch only**

`src/useQuotes.ts` — in the `setDoc` call:

```typescript
      createdAt: createdAt ?? now,
      updatedAt: now,
```

Leave the `updateDoc` branch untouched — it never writes `createdAt`, so
re-saving an old quote can never renumber it.

- [ ] **Step 3: Mint it in the editor**

`src/QuoteEditor.tsx` — next to the other quote-level state (after the
`quoteId` line at 109):

```typescript
  // Minted once, on open. A new quote's number is printable before it is saved,
  // and stays the same once it is.
  const [createdAt] = useState(() => existingQuote?.createdAt ?? Date.now());
```

- [ ] **Step 4: Pass it through on save**

`src/QuoteEditor.tsx` — in `handleSave`:

```typescript
      const res = await saveQuote(
        customer.name,
        quoteName || "Untitled",
        lines,
        totals.totalSale,
        status,
        quoteId,
        createdAt
      );
```

- [ ] **Step 5: Verify**

Run: `npm test` — Expected: PASS, 63 tests
Run: `npm run lint` — Expected: clean
Run: `npm run build` — Expected: succeeds

- [ ] **Step 6: Commit**

```bash
git add src/useQuotes.ts src/QuoteEditor.tsx
git commit -m "Mint a quote's createdAt when the editor opens

saveQuote stamped createdAt at save time, so a PDF shared before the first
save would carry a different quote number than the document that got stored.
The editor mints it on open and hands it to saveQuote; the update branch
still never touches createdAt, so re-saving cannot renumber an old quote.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The document

**Files:**
- Modify: `src/CustomerView.tsx`
- Modify: `src/CustomerView.css`
- Modify: `src/QuoteEditor.tsx:266-279`

**Interfaces:**
- Consumes: `quoteNumber(ts)` and `formatMoney(n, decimals?)` from Task 1; `company.validity` / `company.terms` from Task 3; the editor's `createdAt` state from Task 4; the existing `formatDate(ts)` from `src/format.ts`
- Produces: nothing later tasks depend on

**Context:** everything here renders inside `.cv-doc`, the node `sharePdf`
rasterises with html2canvas. That means the `₹` glyph and Telugu terms reach the
PDF exactly as they render on screen — no jsPDF font work is involved. Fixed hex
colours, not tokens, inside this block.

- [ ] **Step 1: Widen the props**

`src/CustomerView.tsx` — in `CustomerViewProps`, replace the `customerName` line
and add the rest:

```typescript
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  /** The quote's creation time — the document's date and the source of its number. */
  createdAt: number;
  quoteName?: string;
```

And in the destructured signature:

```typescript
export function CustomerView({
  lines, totals, company, onClose,
  customerName = "", customerAddress = "", customerPhone = "",
  createdAt, quoteName = "", autoShare = false, onShareHandled,
}: CustomerViewProps) {
```

- [ ] **Step 2: Swap the format import**

`src/CustomerView.tsx:4` — every `formatINR` call in this file becomes
`formatMoney`, so the import changes wholesale:

```typescript
import { formatMoney, formatDate, quoteNumber } from "./format";
```

- [ ] **Step 3: Compute the header values**

`src/CustomerView.tsx` — next to the existing `hasCompany` line (101):

```typescript
  const docNo = quoteNumber(createdAt);
  const docDate = formatDate(createdAt);
  const hasTerms = !!(company.validity || company.terms);
```

- [ ] **Step 4: Replace the bare title with a title + No./Date block**

`src/CustomerView.tsx` — replace this line:

```tsx
          <h1 className="cv-title">Quotation</h1>
```

with:

```tsx
          <div className="cv-docmeta">
            <h1 className="cv-title">Quotation</h1>
            <div className="cv-docmeta-fields">
              {docNo && (
                <div className="cv-docmeta-row">
                  <span>No.</span><strong className="tnum">{docNo}</strong>
                </div>
              )}
              {docDate && (
                <div className="cv-docmeta-row">
                  <span>Date</span><strong className="tnum">{docDate}</strong>
                </div>
              )}
            </div>
          </div>

          {customerName && (
            <div className="cv-billto">
              <div className="cv-billto-label">To</div>
              <div className="cv-billto-name">{customerName}</div>
              {customerAddress && <div className="cv-billto-line">{customerAddress}</div>}
              {customerPhone && <div className="cv-billto-line">📞 {customerPhone}</div>}
            </div>
          )}

          {quoteName && (
            <p className="cv-subject">
              <span className="cv-subject-label">Subject:</span> {quoteName}
            </p>
          )}
```

- [ ] **Step 5: Put the symbol on every amount**

`src/CustomerView.tsx` — the six money call sites:

```tsx
                    {show("listPrice") && <td className="num">{l.listPrice ? formatMoney(l.listPrice) : "—"}</td>}
```
```tsx
                    {show("rate")      && <td className="num">{formatMoney(l.result.resolvedSell, 2)}</td>}
```
```tsx
                    {show("amount")    && <td className="num">{formatMoney(l.result.lineSaleTotal)}</td>}
```
```tsx
              <strong>{formatMoney(totals.totalSale)}</strong>
```
```tsx
              <strong>{formatMoney(totals.totalGst)}</strong>
```
```tsx
              <strong>{formatMoney(totals.grandTotal)}</strong>
```

- [ ] **Step 6: Print validity and terms under the totals**

`src/CustomerView.tsx` — immediately after the closing `</div>` of `.cv-totals`,
still inside `.cv-doc`:

```tsx
          {hasTerms && (
            <div className="cv-terms">
              {company.validity && <p className="cv-validity">{company.validity}</p>}
              {company.terms && (
                <>
                  <div className="cv-terms-label">Terms</div>
                  <p className="cv-terms-body">{company.terms}</p>
                </>
              )}
            </div>
          )}
```

- [ ] **Step 7: Style the new blocks**

`src/CustomerView.css` — replace the existing `.cv-title` rule with the block
below (the title now sits in a flex row, so its bottom margin moves to the
wrapper):

```css
/* --- Document meta: title + number/date --- */
.cv-docmeta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 20px;
}

.cv-title {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  color: #1a1a1a;
}

.cv-docmeta-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
  font-size: 0.9rem;
}
.cv-docmeta-row {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.cv-docmeta-row span {
  color: #555;
}
.cv-docmeta-row strong {
  min-width: 118px;
  text-align: right;
  color: #1a1a1a;
}

/* --- Bill-to block --- */
.cv-billto {
  margin-bottom: 18px;
  line-height: 1.5;
}
.cv-billto-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #888;
  margin-bottom: 3px;
}
.cv-billto-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1a1a1a;
}
.cv-billto-line {
  font-size: 0.9rem;
  color: #555;
}

.cv-subject {
  margin: 0 0 18px;
  font-size: 0.95rem;
  color: #1a1a1a;
}
.cv-subject-label {
  color: #888;
  font-weight: 600;
}

/* --- Validity and terms --- */
.cv-terms {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid #eee;
}
.cv-validity {
  margin: 0 0 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1a1a1a;
}
.cv-terms-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #888;
  margin-bottom: 4px;
}
.cv-terms-body {
  margin: 0;
  font-size: 0.88rem;
  color: #555;
  line-height: 1.55;
  white-space: pre-line; /* keeps the line breaks Dad typed in settings */
}
```

- [ ] **Step 8: Feed the new props from the editor**

`src/QuoteEditor.tsx` — replace the `CustomerView` element:

```tsx
      <CustomerView
        lines={customerLines}
        totals={totals}
        company={company}
        customerName={customer.name}
        customerAddress={customer.address}
        customerPhone={customer.phone}
        createdAt={createdAt}
        quoteName={quoteName}
        autoShare={pendingShare}
        onShareHandled={() => setPendingShare(false)}
        onClose={() => setMode("business")}
      />
```

Note `quoteName={quoteName}` — the raw value, not `quoteName || "Quotation"`.
`CustomerView` already falls back to `"Quotation"` for the share-sheet title
(line 78), and `pdfFilename` handles an empty quote name. With the sentinel
gone, "is there a subject line?" is simply "is `quoteName` non-empty?".

- [ ] **Step 9: Verify**

Run: `npm test` — Expected: PASS, 63 tests
Run: `npm run lint` — Expected: clean, no unused `formatINR` import left behind
Run: `npm run build` — Expected: succeeds

- [ ] **Step 10: Commit**

```bash
git add src/CustomerView.tsx src/CustomerView.css src/QuoteEditor.tsx
git commit -m "Make the customer view an actual quotation

It printed a table and three totals — no name, no date, no number, no terms,
and bare numbers where the rest of the app shows a rupee symbol. Now it
carries a To block from the customer record, a number derived from the
quote's creation time, the date, an optional subject from the quote name,
and the validity and terms from company settings. Every field hides when
empty, so a customer with no address on file still prints cleanly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in a browser and update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5
- Produces: nothing

**Context:** the document layout has no automated coverage — the suite is
`environment: 'node'`. These checks are done by hand and reported honestly. If
one fails, fix it and re-run rather than recording a pass.

- [ ] **Step 1: Run the full suite one more time**

Run: `npm test` — Expected: PASS, 63 tests
Run: `npm run lint` — Expected: clean
Run: `npm run build` — Expected: succeeds

- [ ] **Step 2: Check a full document by hand**

Run `npm run dev`. Fill in every company setting including validity and terms.
Open a customer that has an address and phone, create a quote with a name and a
couple of items, switch to Customer view. Confirm:

- company header on the left, `No.` and `Date` on the right
- the number reads `Q-YYMMDD-HHMM` and the date matches today
- the To block shows the customer's name, address and phone
- the subject line shows the quote name
- every money column and all three totals carry `₹`
- validity and terms print under the totals, with your line breaks intact

- [ ] **Step 3: Check a bare document by hand**

Clear the company settings (including validity and terms), use a customer with
no address or phone, and leave the quote name empty. Switch to Customer view and
confirm nothing renders as `undefined`, no empty label sits on its own, and the
document still looks deliberate.

- [ ] **Step 4: Check the number survives the first save**

Create a new quote, go straight to Customer view **without saving**, and note the
number. Go back, save, and return to Customer view. The number must be identical.
Reopen the quote from the customer's history — still identical.

- [ ] **Step 5: Check fractional quantities end to end**

Add an item with qty `2.5` and a direct sell rate of `48`. Confirm the collapsed
row reads `2.5 × ₹48.00`, the line amount is `₹120`, and the customer document
shows qty `2.5` and amount `₹120`. Confirm the qty field offers a decimal point
on a phone keypad (or in dev tools device mode).

- [ ] **Step 6: Update CLAUDE.md**

Four edits:

1. **Running locally** — the test count line becomes:
   `npm test           # 63 unit tests (Vitest) — 23 engine, 15 format, 9 voiceParse, 16 types`
2. **WHAT IS DONE** — add above the redesign entry:
   ```markdown
   - [x] **PI-2 The document** — the customer view is a quotation now: To block
         (name, address, phone from the customer record), quote number derived
         from `createdAt` (`Q-260806-1423`), date, optional subject from the
         quote name, validity and terms from company settings, and `₹` on every
         amount. Fractional quantities fixed (bug #5) — one tested `parseQty`
         replaces five `parseInt` calls. Verified by hand in a browser; the
         layout has no automated coverage because tests are `environment: 'node'`.
   ```
3. **KNOWN BUGS** — delete item 5 (quantities truncate to integers) entirely,
   leaving item 6 and the numbering note as they are.
4. **WHAT TO BUILD NEXT** — delete the whole `### PI-2 — The document` section,
   so PI-3 becomes the next thing to build.

Also add `validity` and `terms` to the `CompanySettings` description in the
**Key files** list:

```
  useCompanySettings.ts  — company details in localStorage (incl. validity + terms)
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "Move PI-2 to done and close bug #5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log --oneline -6
```

---

## Test count reference

| File | Before | After |
|---|---|---|
| `calc/engine.test.ts` | 21 | 23 |
| `format.test.ts` | 9 | 15 |
| `voiceParse.test.ts` | 9 | 9 |
| `types.test.ts` | 13 | 16 |
| **Total** | **52** | **63** |
