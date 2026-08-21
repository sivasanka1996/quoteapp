# PI-9 → PI-12 Implementation Plan

> ## ✅ COMPLETE — this plan is a historical record
>
> **PI-9 through PI-12 all shipped on 2026-08-18; the cross-customer copy followed on 2026-08-19.**
> The unticked `- [ ]` boxes below were never ticked off as the work landed;
> they record the plan as written, **not** work outstanding. Do not pick a task
> up from here.
>
> What shipped is in [`CLAUDE.md`](../../../CLAUDE.md) under WHAT IS DONE; the
> evidence is in [`pi-9-to-12-verification.md`](../../../docs/history/pi-9-to-12-verification.md).
> Banner added 2026-08-20, when the boxes were found still reading as pending.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent improvements to the quotation app — duplicate a quote, undo and voice-edit a line, finish the multi-page image path, and get the app's component behaviour under automated test for the first time.

**Architecture:** Every feature follows the same split this codebase already uses — a pure, exhaustively-tested function in a small module, and a thin component that calls it. New Firestore writes go through the existing `saveQuote` path so the ack race in `firestoreAck.ts` is never duplicated. Testing gains a second Vitest *project* running jsdom, so the 241 existing node tests keep running byte-identically alongside new component tests.

**Tech Stack:** React 19 + Vite + TypeScript, Vitest 4.1.9, Testing Library (new), Firebase Firestore.

**Spec:** [`docs/superpowers/specs/2026-08-17-pi-9-to-12-design.md`](../specs/2026-08-17-pi-9-to-12-design.md)

## Global Constraints

- **`npm run build` is the typecheck, not `npx tsc --noEmit`.** The root `tsconfig.json` holds only `references` and typechecks zero files. Always verify with `npm run build`.
- **Test files compile under `tsconfig.app.json`**, which sets `"types": ["vite/client"]` — no Node types. Reach `process` through `globalThis` if ever needed.
- **Tests import from `vitest` explicitly** (`import { describe, it, expect } from "vitest"`). Do not rely on globals in new files.
- **All 241 existing tests must keep passing after every task.** Run `npm test` before each commit.
- **`npm run lint` must stay clean** — it is enforced in CI. `**/*.{ts,tsx}` is already linted, so new `.tsx` files are covered.
- **Every tunable value goes in `config/app.config.ts`**, never inlined in a source file. That file is `as const`.
- **Commit author must be `revan.datta132@gmail.com`.** Verify with `git log -1 --format='%ae'`.
- **Commit locally and stop. Do not push.** `git push` returns 403; that is a known human task.
- **Do not touch `cf-worker/`.** Nothing in this plan changes the Worker.
- **Design tokens only** — colours, spacing, radii come from `src/index.css` custom properties. No hardcoded hex or px spacing. Touch targets are `var(--tap)` (48px).

---

## Task 1: jsdom test project

Adds a second Vitest project so components can be tested, without disturbing the node suite. Nothing renders yet — this task's deliverable is that both projects run.

**Files:**
- Modify: `vite.config.ts:39-42`
- Modify: `tsconfig.app.json`
- Modify: `package.json` (devDependencies)
- Create: `src/test-setup.ts`
- Test: `src/smoke.dom.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the file-naming convention `src/**/*.dom.test.tsx` for every DOM test in Tasks 9–11, and a setup file that runs `@testing-library/jest-dom` matchers plus `cleanup()` after each test.

- [ ] **Step 1: Install the test libraries**

```bash
npm install --save-dev jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Write the setup file**

Create `src/test-setup.ts`:

```ts
// Runs before every file in the `dom` Vitest project.
//
// Testing Library does not unmount between tests on its own when globals are
// off, and a left-over tree makes the next test's queries match two elements
// and fail for a reason that has nothing to do with what it is checking.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Split the Vitest config into two projects**

Replace the `test` block in `vite.config.ts` (currently lines 39–42) with:

```ts
  test: {
    // Two projects, not one environment switched over. The node suite is 241
    // tests of pure functions plus a Cloudflare Worker that is a
    // `fetch(Request) => Response` handler — jsdom would buy those nothing and
    // risks changing what they exercise. The separate `.dom.test.tsx` glob
    // keeps the boundary explicit, so nobody later writes a "pure" test that
    // silently depends on a DOM being present.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.{js,ts}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.tsx'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
```

- [ ] **Step 4: Add jest-dom types to the app tsconfig**

In `tsconfig.app.json`, change the `types` line to:

```json
    "types": ["vite/client", "@testing-library/jest-dom"],
```

- [ ] **Step 5: Write the smoke test**

Create `src/smoke.dom.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("jsdom project", () => {
  it("renders a component and finds it in the document", () => {
    render(<button type="button">Read from Image</button>);
    expect(screen.getByRole("button", { name: "Read from Image" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: **242 tests passing** — the 241 that already existed under project `unit`, plus 1 under project `dom`. If any of the 241 changed count or status, the include globs are wrong; fix before continuing.

- [ ] **Step 7: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both clean. The build is the real typecheck.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts tsconfig.app.json package.json package-lock.json src/test-setup.ts src/smoke.dom.test.tsx
git commit -m "Give the app a place to test its components"
```

---

## Task 2: duplicateQuote, and a shared UILine→LineInput adapter

The pure half of PI-9. Also lifts `toPriceMode` / `toLineInput` out of `QuoteEditor.tsx` so a second caller can compute a quote total without importing from a component.

**Files:**
- Create: `src/calc/lineInput.ts`
- Modify: `src/QuoteEditor.tsx:1-58` (remove the two helpers, import them instead)
- Modify: `src/types.ts` (append `duplicateQuote`)
- Test: `src/types.test.ts`

**Interfaces:**
- Consumes: `UILine`, `QuoteDoc`, `QuoteStatus` from `src/types.ts`; `calcQuote`, `discountsFromPercents`, `LineInput`, `PriceMode` from `src/calc/engine.ts`.
- Produces:
  - `toLineInput(l: UILine): LineInput` and `toPriceMode(mode, list, disc1, disc2, rate): PriceMode` from `src/calc/lineInput.ts`
  - `duplicateQuote(source: QuoteDoc, opts: DuplicateOpts): DuplicateResult` from `src/types.ts`
  - `interface DuplicateOpts { customerId: string; customerName: string; now: number }`
  - `interface DuplicateResult { customerId: string; customerName: string; name: string; lines: UILine[]; status: QuoteStatus; createdAt: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/types.test.ts` (add `duplicateQuote` and the `QuoteDoc` type to the existing import from `"./types"`):

```ts
describe("duplicateQuote", () => {
  function line(id: number, name: string): UILine {
    return {
      id, name, qty: "2",
      costMode: "discount", costList: "1000", costDisc1: "10", costDisc2: "", costRate: "",
      sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "950",
      gstPct: "18",
    };
  }

  function source(over: Partial<QuoteDoc> = {}): QuoteDoc {
    return {
      id: "q1",
      customerId: "c1",
      customerName: "Ravi Electricals",
      name: "Shop order",
      lines: [line(4, "Wire 2.5sq"), line(9, "MCB 32A")],
      totalSale: 3800,
      status: "accepted",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      ...over,
    };
  }

  const opts = { customerId: "c1", customerName: "Ravi Electricals", now: 1_800_000_000_000 };

  it("copies every line", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.lines).toHaveLength(2);
    expect(d.lines.map((l) => l.name)).toEqual(["Wire 2.5sq", "MCB 32A"]);
  });

  it("re-mints line ids from 1 so they cannot collide with the source", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.lines.map((l) => l.id)).toEqual([1, 2]);
  });

  it("deep-copies, so editing the copy never touches the original", () => {
    const src = source();
    const d = duplicateQuote(src, opts);
    d.lines[0].sellRate = "1";
    expect(src.lines[0].sellRate).toBe("950");
  });

  it("forces the copy to draft, whatever the source was", () => {
    expect(duplicateQuote(source({ status: "accepted" }), opts).status).toBe("draft");
    expect(duplicateQuote(source({ status: "sent" }), opts).status).toBe("draft");
  });

  it("marks the name as a copy", () => {
    expect(duplicateQuote(source({ name: "Shop order" }), opts).name).toBe("Shop order (copy)");
  });

  it("names an unnamed quote's copy without leaving a stray bracket", () => {
    expect(duplicateQuote(source({ name: "" }), opts).name).toBe("Copy of Untitled");
    expect(duplicateQuote(source({ name: "   " }), opts).name).toBe("Copy of Untitled");
  });

  it("treats the legacy 'Untitled' placeholder as no name", () => {
    // Pre-PI-2 quotes carry the literal word; it is not something Dad typed.
    expect(duplicateQuote(source({ name: "Untitled" }), opts).name).toBe("Copy of Untitled");
  });

  it("is a new document, not a revision", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.createdAt).toBe(1_800_000_000_000);
  });

  it("can be aimed at a different customer", () => {
    const d = duplicateQuote(source(), {
      customerId: "c2", customerName: "Kumar Traders", now: 1_800_000_000_000,
    });
    expect(d.customerId).toBe("c2");
    expect(d.customerName).toBe("Kumar Traders");
  });

  it("survives a quote with no lines", () => {
    expect(duplicateQuote(source({ lines: [] }), opts).lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- types`
Expected: FAIL — `duplicateQuote is not a function` / `is not exported`.

- [ ] **Step 3: Implement `duplicateQuote`**

Append to `src/types.ts`:

```ts
/** Where a duplicate is going, and when it was made. */
export interface DuplicateOpts {
  customerId: string;
  customerName: string;
  /** Injected rather than read from the clock, so the result is testable. */
  now: number;
}

/** Everything `saveQuote` needs for the new quote. */
export interface DuplicateResult {
  customerId: string;
  customerName: string;
  name: string;
  lines: UILine[];
  status: QuoteStatus;
  createdAt: number;
}

/**
 * A quote copied to a new one, for the same customer or a different one.
 *
 * This does NOT breach the locked "no price memory" rule. That rule forbids the
 * *app inferring* prices — a catalog, an index, suggestions. This copies a
 * document Dad picked. The app learns nothing and stores no price history.
 *
 * The real hazard is stale prices carried forward silently, and it is answered
 * by making the copy obvious rather than by adding cleverness: the name says it
 * is a copy, and the status is forced back to draft so a copied *accepted*
 * quote can never read as a second accepted quote.
 *
 * Returns arguments rather than writing anything. The Firestore write stays on
 * `saveQuote`, which already races the server ack — a second write site would
 * be a second chance to hang Dad's button offline (see firestoreAck.ts).
 *
 * `totalSale` is deliberately absent: it is denormalized, the stored value can
 * be stale on pre-PI-2 quotes with fractional quantities (bug #9), and copying
 * it forward would carry that staleness into a brand new document. The caller
 * recomputes it from `lines`.
 */
export function duplicateQuote(
  source: QuoteDoc,
  opts: DuplicateOpts
): DuplicateResult {
  const base = source.name?.trim() ?? "";
  // "Untitled" was an internal storage placeholder before PI-2 promoted the
  // quote name to a Subject line — see QuoteEditor. It is not a real name.
  const real = base === "Untitled" ? "" : base;

  return {
    customerId: opts.customerId,
    customerName: opts.customerName,
    name: real ? `${real} (copy)` : "Copy of Untitled",
    // Fresh ids from 1, and a fresh object per line so editing the copy cannot
    // reach back into the quote it came from.
    lines: (source.lines ?? []).map((l, i) => ({ ...l, id: i + 1 })),
    status: "draft",
    createdAt: opts.now,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- types`
Expected: PASS — 34 tests in `types.test.ts` (24 existing + 10 new).

- [ ] **Step 5: Extract the LineInput adapter**

Create `src/calc/lineInput.ts`:

```ts
// UILine (what the editor holds, all strings) → LineInput (what the engine
// takes, all numbers).
//
// Lifted out of QuoteEditor.tsx so a second caller can total a quote without
// importing from a component. CustomerScreen needs exactly that to recompute
// `totalSale` when duplicating.

import { discountsFromPercents, type LineInput, type PriceMode } from "./engine";
import { parseQty, type UILine } from "../types";

export function toPriceMode(
  mode: "discount" | "direct", list: string,
  disc1: string, disc2: string, rate: string
): PriceMode {
  if (mode === "direct") return { kind: "direct", rate: parseFloat(rate) || 0 };
  // Numbers straight through. This used to format the two fields into
  // "64.7% + 2%" so the engine could split them apart again — see the
  // PriceMode doc comment in calc/engine.ts.
  return {
    kind: "discount",
    listPrice: parseFloat(list) || 0,
    discounts: discountsFromPercents(disc1, disc2),
  };
}

export function toLineInput(l: UILine): LineInput {
  return {
    name: l.name, qty: parseQty(l.qty),
    cost: toPriceMode(l.costMode, l.costList, l.costDisc1, l.costDisc2, l.costRate),
    sell: toPriceMode(l.sellMode, l.sellList, l.sellDisc1, l.sellDisc2, l.sellRate),
    gstPct: parseFloat(l.gstPct) || 0,
  };
}
```

- [ ] **Step 6: Point QuoteEditor at the extracted module**

In `src/QuoteEditor.tsx`:

1. Delete the `toPriceMode` function (currently lines 35–49) and the `toLineInput` function (currently lines 51–58).
2. Add this import after the `./calc/engine` import:

```ts
import { toLineInput } from "./calc/lineInput";
```

3. Trim the `./calc/engine` import. **Verified against source before writing this:** `discountsFromPercents` is called only at the old line 47, inside `toPriceMode`, which is moving out. `applyBlanket` (lines 71–77) sets discount *strings* on the UILine and never touches the engine. `LineInput` and `PriceMode` are likewise used only by the two moved helpers. So all three go, and the import becomes exactly:

```ts
import { calcQuote, type LineResult } from "./calc/engine";
```

> `noUnusedLocals` is on in `tsconfig.app.json`, so leaving any of the three in fails `npm run build` naming the exact symbol.

- [ ] **Step 7: Verify the extraction changed no behaviour**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, **252 tests** (242 after Task 1, +10). The engine's own 23 tests passing unchanged is the proof this was a pure move.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/types.test.ts src/calc/lineInput.ts src/QuoteEditor.tsx
git commit -m "Work out what copying a quote actually means"
```

---

## Task 3: The copy button and sheet

The user-facing half of PI-9.

**Files:**
- Modify: `src/CustomerScreen.tsx`
- Modify: `src/CustomerScreen.css`
- Test: manual browser check now; automated in Task 11.

**Interfaces:**
- Consumes: `duplicateQuote`, `DuplicateResult` from `src/types.ts`; `toLineInput` from `src/calc/lineInput.ts`; `calcQuote` from `src/calc/engine.ts`; `saveQuote` from the existing `useQuotes(customer.id)` call at `CustomerScreen.tsx:48`; `onOpenQuote` from `Props`.
- Produces: no new exports.

- [ ] **Step 1: Add the imports and pull `saveQuote` off the hook**

In `src/CustomerScreen.tsx`:

```ts
import { calcQuote } from "./calc/engine";
import { toLineInput } from "./calc/lineInput";
import { duplicateQuote } from "./types";
```

Change line 48 from:

```ts
  const { quotes, loading, deleteQuote } = useQuotes(customer.id);
```

to:

```ts
  const { quotes, loading, deleteQuote, saveQuote } = useQuotes(customer.id);
```

- [ ] **Step 2: Add the sheet's state**

Add near the other `useState` calls in the component:

```tsx
  // The quote being copied, or null when the sheet is shut.
  const [copying, setCopying] = useState<QuoteDoc | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  function openCopy(q: QuoteDoc) {
    // Prefill from the pure helper so the sheet shows exactly the name that
    // will be saved if Dad changes nothing.
    setCopyName(duplicateQuote(q, {
      customerId: customer.id, customerName: customer.name, now: Date.now(),
    }).name);
    setCopyError(null);
    setCopying(q);
  }
```

- [ ] **Step 3: Add the confirm handler**

```tsx
  async function confirmCopy() {
    if (!copying) return;
    setCopyBusy(true);
    setCopyError(null);
    try {
      const d = duplicateQuote(copying, {
        customerId: customer.id,
        customerName: customer.name,
        now: Date.now(),
      });
      // Recomputed, never copied — the stored totalSale can be stale on
      // pre-PI-2 quotes with fractional quantities (bug #9).
      const { totals } = calcQuote(d.lines.map(toLineInput));
      const res = await saveQuote(
        d.customerName,
        copyName.trim() || d.name,
        d.lines,
        totals.totalSale,
        d.status,
        undefined,
        d.createdAt
      );
      log.info("ui", "quote duplicated", {
        from: copying.id, to: res.id, queued: res.queued, lineCount: d.lines.length,
      });
      setCopying(null);
      // Land him in the editor, ready to change prices — which is the whole
      // reason he copied it.
      onOpenQuote({
        id: res.id,
        customerId: d.customerId,
        customerName: d.customerName,
        name: copyName.trim() || d.name,
        lines: d.lines,
        totalSale: totals.totalSale,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.createdAt,
      });
    } catch (e) {
      log.error("ui", "quote duplicate failed", e, { from: copying.id });
      setCopyError("Could not copy this quote. Please try again.");
    } finally {
      setCopyBusy(false);
    }
  }
```

> `saveQuote` already races the server ack, so this resolves in ~2.5s offline with `queued: true` rather than hanging. Do not add a second timeout.

- [ ] **Step 4: Add the copy button to each quote row**

The row currently renders (around line 207):

```tsx
              <button className="cs-row-main" onClick={() => onOpenQuote(q)}>
```

Add a sibling button immediately after that button's closing tag, inside the same row container:

```tsx
              <button
                className="cs-row-copy"
                aria-label={`Copy quote ${q.name?.trim() || "Untitled"}`}
                onClick={() => openCopy(q)}
              >
                ⧉
              </button>
```

- [ ] **Step 5: Add the sheet markup**

**Use the existing edit sheet's structure exactly.** It was read from source before this was written: `.cs-overlay` › `.cs-sheet` › `.cs-sheet-header` (an `<h2>` plus `.cs-sheet-close`) › `.cs-sheet-body` (bare `<label><span>…</span><input/></label>`, no wrapper class) › `.cs-sheet-note` › `.cs-sheet-footer` (`.cs-btn-cancel`, `.cs-btn-save`). Every one of those classes already exists and is already styled. Do not invent a parallel vocabulary — the two sheets must be visually identical, and reusing the markup is what guarantees it.

Add after the existing edit-sheet block, before the component's closing `</div>`:

```tsx
      {copying && (
        <div
          className="cs-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !copyBusy) setCopying(null);
          }}
        >
          <div className="cs-sheet">
            <div className="cs-sheet-header">
              <h2>Copy Quote</h2>
              <button
                className="cs-sheet-close"
                onClick={() => setCopying(null)}
                aria-label="Close"
                disabled={copyBusy}
              >
                ✕
              </button>
            </div>
            <div className="cs-sheet-body">
              <label>
                <span>Name *</span>
                <input
                  value={copyName}
                  placeholder="Quote name"
                  onChange={(e) => setCopyName(e.target.value)}
                  autoFocus
                />
              </label>
              <p className="cs-sheet-note">
                {copying.lines?.length ?? 0} item
                {(copying.lines?.length ?? 0) !== 1 ? "s" : ""} will be copied as a
                new draft. Check the prices — they are as they were when this
                quote was made.
              </p>
              {copyError && <p className="cs-copy-error">{copyError}</p>}
            </div>
            <div className="cs-sheet-footer">
              <button
                className="cs-btn-cancel"
                onClick={() => setCopying(null)}
                disabled={copyBusy}
              >
                Cancel
              </button>
              <button
                className="cs-btn-save"
                onClick={confirmCopy}
                disabled={copyBusy || !copyName.trim()}
              >
                {copyBusy ? "Copying…" : "Copy Quote"}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Style only what is genuinely new**

`.cs-overlay`, `.cs-sheet`, `.cs-sheet-header`, `.cs-sheet-close`, `.cs-sheet-body`, `.cs-sheet-note`, `.cs-sheet-footer`, `.cs-btn-cancel` and `.cs-btn-save` are **already styled** — adding rules for any of them would collide with the cascade. Only two classes are new. Append to `src/CustomerScreen.css`:

```css
/* Copy control on a quote row. `.cs-row-main` fills the row, so this sits
   after it as a fixed-width sibling. */
.cs-row-copy {
  min-width: var(--tap);
  min-height: var(--tap);
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  font-size: var(--fs-lg);
  color: var(--ink-3);
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
}
.cs-row-copy:hover { background: var(--surface-2); color: var(--ink); }
.cs-row-copy:focus-visible { outline: 2px solid var(--green-600); outline-offset: -2px; }

.cs-copy-error {
  margin: var(--s-2) 0 0;
  font-size: var(--fs-sm);
  color: var(--loss);
}
```

> Check `.cs-row` is a flex container before assuming the button sits beside `.cs-row-main` rather than below it. If it is not, make it one — do not position the button absolutely.

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, 252 tests.

Then check by hand — `npm run dev`, open a customer with a saved quote at a 390px viewport:
1. The ⧉ button appears on the row and is at least 48×48.
2. Tapping it opens the sheet prefilled with `"<name> (copy)"`.
3. Confirm navigates into a **new** quote whose lines match, whose badge reads **Draft**, and whose quote number differs from the source.
4. The original quote is unchanged in the list.

- [ ] **Step 8: Commit**

```bash
git add src/CustomerScreen.tsx src/CustomerScreen.css
git commit -m "Let Dad copy a quote instead of retyping it"
```

---

## Task 4: Reorder pages before reading

**Files:**
- Create: `src/parse/movePage.ts`
- Create: `src/parse/movePage.test.ts`
- Modify: `src/ImageReader.tsx`
- Modify: `src/ImageReader.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `movePage<T>(items: T[], from: number, to: number): T[]` from `src/parse/movePage.ts` — pure, returns a new array, returns the input unchanged when either index is out of range.

- [ ] **Step 1: Write the failing tests**

Create `src/parse/movePage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { movePage } from "./movePage";

describe("movePage", () => {
  const pages = ["a", "b", "c"];

  it("moves an item later", () => {
    expect(movePage(pages, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves an item earlier", () => {
    expect(movePage(pages, 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input", () => {
    const src = ["a", "b", "c"];
    movePage(src, 0, 2);
    expect(src).toEqual(["a", "b", "c"]);
  });

  it("refuses a move off the front", () => {
    expect(movePage(pages, 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("refuses a move off the end", () => {
    expect(movePage(pages, 2, 3)).toEqual(["a", "b", "c"]);
  });

  it("refuses a move from an index that does not exist", () => {
    expect(movePage(pages, 5, 0)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when from and to are the same", () => {
    expect(movePage(pages, 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list", () => {
    expect(movePage([], 0, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- movePage`
Expected: FAIL — cannot resolve `./movePage`.

- [ ] **Step 3: Implement it**

Create `src/parse/movePage.ts`:

```ts
/**
 * One item moved to a new index, as a new array.
 *
 * Pages are badged p1/p2/p3 in the order they were picked, so photographing
 * page 3 first badges the whole order wrongly. Before this the only repair was
 * removing every page and re-adding them.
 *
 * Out-of-range indices return the list untouched rather than throwing: the
 * callers are ▲▼ buttons at the ends of a strip, and a disabled-button bug
 * should not be able to lose Dad's photos.
 */
export function movePage<T>(items: T[], from: number, to: number): T[] {
  if (!Array.isArray(items)) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  if (from === to) return items.slice();

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- movePage`
Expected: PASS — 8 tests.

- [ ] **Step 5: Wire it into the panel**

In `src/ImageReader.tsx`, add the import:

```ts
import { movePage } from "./parse/movePage";
```

Add this handler next to `removePage`:

```tsx
  /**
   * Reordering is offered only before the read starts. Reordering *results* is
   * a different and much larger problem, and merged rows already carry the page
   * they came from.
   */
  function reorderPage(from: number, to: number) {
    setPages((prev) => {
      const next = movePage(prev, from, to);
      if (next !== prev) {
        log.debug("image", "pages reordered", { from, to, count: prev.length });
        resetRead();
      }
      return next;
    });
  }
```

- [ ] **Step 6: Add the controls to the page strip**

In the `.ir-page` block (currently around lines 329–341), add before the remove button:

```tsx
                  {multi && stage === "idle" && (
                    <div className="ir-page-move">
                      <button
                        className="ir-page-up"
                        aria-label={`Move page ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() => reorderPage(i, i - 1)}
                      >
                        ▲
                      </button>
                      <button
                        className="ir-page-down"
                        aria-label={`Move page ${i + 1} later`}
                        disabled={i === pages.length - 1}
                        onClick={() => reorderPage(i, i + 1)}
                      >
                        ▼
                      </button>
                    </div>
                  )}
```

- [ ] **Step 7: Style the controls**

Append to `src/ImageReader.css`:

```css
/* ▲▼ rather than drag: dragging on a phone competes with page scroll, needs a
   long-press to disambiguate, and is hard to hit at 48px. */
.ir-page-move {
  position: absolute;
  left: var(--s-1);
  bottom: var(--s-1);
  display: flex;
  gap: var(--s-1);
}
.ir-page-move button {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  font-size: var(--fs-xs);
  line-height: 1;
  color: var(--surface);
  background: rgba(22, 32, 28, .62);
  border: none;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ir-page-move button:disabled { opacity: .3; cursor: default; }
.ir-page-move button:focus-visible { outline: 2px solid var(--surface); outline-offset: 1px; }
```

> `.ir-page` must be `position: relative` for this to anchor. It already is, because `.ir-page-num` and `.ir-page-remove` are positioned inside it — confirm before assuming.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, **260 tests**.

- [ ] **Step 9: Commit**

```bash
git add src/parse/movePage.ts src/parse/movePage.test.ts src/ImageReader.tsx src/ImageReader.css
git commit -m "Let a page that was photographed out of order be put right"
```

---

## Task 5: Warn before a long multi-page read

**Files:**
- Modify: `config/app.config.ts`
- Modify: `src/ImageReader.tsx`
- Modify: `src/ImageReader.css`

**Interfaces:**
- Consumes: `appConfig` from `config/app.config.ts`.
- Produces: `appConfig.image.longReadPages` (number) and `appConfig.image.secondsPerPage` (number).

- [ ] **Step 1: Add the two settings**

In `config/app.config.ts`, inside the `image` block after `jpegQuality`:

```ts
    /**
     * Page count at which reading is confirmed first.
     *
     * Pages read sequentially, one model call each (spec §5.2), and that stays
     * — a long list already sits against a single 8192-token ceiling, and
     * batching would make the known risk worse to save a few cents. So ten
     * pages is ten round trips.
     *
     * This is a WARNING, not a cap. A genuine ten-page order must still be
     * readable; what is being prevented is the surprise, not the long read.
     */
    longReadPages: 6,

    /**
     * Rough seconds per page, for the estimate in that confirmation. Measured
     * on the live runs of 2026-08-12: 2.9s, 3.9s and 2.4s for a three-page
     * order. Deliberately approximate — it sets an expectation, it is not a
     * promise.
     */
    secondsPerPage: 3,
```

- [ ] **Step 2: Import the config in the panel**

In `src/ImageReader.tsx`:

```ts
import { appConfig } from "../config/app.config";
```

> Check the relative depth against a file that already imports it — `src/readImage.ts` imports the same module, so copy its specifier exactly.

- [ ] **Step 3: Gate the read behind a confirmation**

Add the state:

```tsx
  const [confirmLong, setConfirmLong] = useState(false);
```

Change the read button's handler so a long read asks first:

```tsx
        {pages.length > 0 && stage === "idle" && !confirmLong && (
          <button
            className="ir-read-btn"
            onClick={() =>
              pages.length >= appConfig.image.longReadPages
                ? setConfirmLong(true)
                : handleRead()
            }
          >
            {multi ? `Read ${pages.length} pages` : "Read items from image"}
          </button>
        )}

        {confirmLong && stage === "idle" && (
          <div className="ir-longread">
            <p>
              {pages.length} pages are read one at a time, so this takes about{" "}
              <b>{Math.round((pages.length * appConfig.image.secondsPerPage) / 5) * 5} seconds</b>.
              Keep the app open while it works.
            </p>
            <div className="ir-longread-actions">
              <button onClick={() => setConfirmLong(false)}>Back</button>
              <button
                className="ir-longread-go"
                onClick={() => { setConfirmLong(false); handleRead(); }}
              >
                Read {pages.length} pages
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Clear the confirmation when the page set changes**

`resetRead()` runs whenever pages are added, removed or reordered. Add to it:

```tsx
    setConfirmLong(false);
```

- [ ] **Step 5: Style it**

Append to `src/ImageReader.css`:

```css
.ir-longread {
  padding: var(--s-4);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.ir-longread p { margin: 0; font-size: var(--fs-sm); color: var(--ink-2); }
.ir-longread-actions { display: flex; gap: var(--s-2); }
.ir-longread-actions button {
  flex: 1;
  min-height: var(--tap);
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--fs-base);
  cursor: pointer;
}
.ir-longread-actions .ir-longread-go {
  background: var(--green-700);
  border-color: var(--green-700);
  color: #fff;
  font-weight: 600;
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, 260 tests.

Check by hand: pick 3 images → the read starts immediately. Pick 6 → the confirmation appears reading "about 20 seconds", Back returns to the button, and Read starts the sequential read.

- [ ] **Step 7: Commit**

```bash
git add config/app.config.ts src/ImageReader.tsx src/ImageReader.css
git commit -m "Say how long a six-page read will take before starting it"
```

---

## Task 6: One-step undo after a voice or image import

**Files:**
- Modify: `src/QuoteEditor.tsx`
- Modify: `src/QuoteEditor.css`

**Interfaces:**
- Consumes: `lines`, `setLines`, `markDirty` — all already in `QuoteEditor`.
- Produces: no new exports. Renders a `<button>` with accessible name `Undo` while an import snapshot exists.

- [ ] **Step 1: Add the snapshot state**

In `src/QuoteEditor.tsx`, next to the other `useState` calls:

```tsx
  /**
   * The lines as they were immediately before the last voice or image import.
   *
   * Deliberately ONE step, not a stack. The failure being solved is "that
   * import was wrong, take it back", which happens at once and once. A stack
   * means deciding what else belongs in it — blanket discounts? line edits?
   * deletes? — which is a far larger design for a smaller benefit.
   */
  const [lastImport, setLastImport] = useState<{ lines: UILine[]; label: string } | null>(null);
```

- [ ] **Step 2: Snapshot before each import**

In `handleAddFromVoice`, immediately before the `setLines` call:

```tsx
    setLastImport({ lines, label: "1 item from voice" });
```

In `handleAddFromImage`, immediately before its `setLines` call:

```tsx
    setLastImport({
      lines,
      label: `${readItems.length} item${readItems.length !== 1 ? "s" : ""} from image`,
    });
```

- [ ] **Step 3: Add the undo handler**

```tsx
  function undoLastImport() {
    if (!lastImport) return;
    log.info("ui", "import undone", { label: lastImport.label });
    setLines(lastImport.lines);
    setLastImport(null);
    markDirty();
  }
```

- [ ] **Step 4: Clear the snapshot on save**

In `handleSave`, inside the branch that runs after a successful save, add:

```tsx
      setLastImport(null);
```

> This matters: undo must never resurrect lines across a save boundary and leave the screen contradicting what Firestore holds.

- [ ] **Step 5: Render the undo bar**

Add immediately above the item list:

```tsx
      {lastImport && (
        <div className="qe-undo">
          <span>Added {lastImport.label}.</span>
          <button className="qe-undo-btn" onClick={undoLastImport}>Undo</button>
        </div>
      )}
```

- [ ] **Step 6: Style it**

Append to `src/QuoteEditor.css`:

```css
.qe-undo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  margin-bottom: var(--s-3);
  background: var(--green-50);
  border: 1px solid var(--green-100);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.qe-undo-btn {
  min-height: var(--tap);
  padding: 0 var(--s-4);
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid var(--green-600);
  border-radius: var(--r-md);
  color: var(--green-700);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}
.qe-undo-btn:focus-visible { outline: 2px solid var(--green-600); outline-offset: 2px; }
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, 260 tests.

Check by hand: add lines by voice → the bar reads "Added 1 item from voice." → Undo removes it and the bar goes. Import again, press Save, and confirm the bar disappears rather than offering an undo of saved data.

- [ ] **Step 8: Commit**

```bash
git add src/QuoteEditor.tsx src/QuoteEditor.css
git commit -m "Take back an import that read the slip wrong"
```

---

## Task 7: ADD / SET intent in the voice parser

Pure parser work. `parseTranscript` keeps its exact signature and behaviour — that is the acceptance condition, as it was for PI-6.

**Files:**
- Modify: `src/voiceParse.ts`
- Test: `src/voiceParse.test.ts`

**Interfaces:**
- Consumes: `VoiceItem`, `parseTranscript` (existing, unchanged).
- Produces from `src/voiceParse.ts`:
  - `type VoiceIntent = { kind: "add"; item: VoiceItem } | { kind: "set"; target: string; field: "rate" | "qty"; value: number }`
  - `parseIntent(text: string): VoiceIntent`

- [ ] **Step 1: Write the failing tests**

Append to `src/voiceParse.test.ts` (add `parseIntent` to the existing import):

```ts
describe("parseIntent", () => {
  it("treats an ordinary line as an add", () => {
    const r = parseIntent("6 wire 1.5sq rate 1650");
    expect(r.kind).toBe("add");
    if (r.kind !== "add") throw new Error("unreachable");
    expect(r.item).toEqual({ name: "wire 1.5sq", qty: 6, rate: 1650 });
  });

  it("reads a rate change", () => {
    const r = parseIntent("change wire rate to 1800");
    expect(r).toEqual({ kind: "set", target: "wire", field: "rate", value: 1800 });
  });

  it("reads a quantity change", () => {
    const r = parseIntent("change wire quantity to 5");
    expect(r).toEqual({ kind: "set", target: "wire", field: "qty", value: 5 });
  });

  it("accepts the other change words", () => {
    expect(parseIntent("set MCB rate to 450").kind).toBe("set");
    expect(parseIntent("update socket rate 120").kind).toBe("set");
  });

  it("keeps a multi-word target intact", () => {
    const r = parseIntent("change copper wire 2.5sq rate to 1800");
    expect(r).toEqual({ kind: "set", target: "copper wire 2.5sq", field: "rate", value: 1800 });
  });

  it("reads a Telugu change word", () => {
    const r = parseIntent("మార్చు wire రేటు 1800");
    expect(r.kind).toBe("set");
    if (r.kind !== "set") throw new Error("unreachable");
    expect(r.field).toBe("rate");
    expect(r.value).toBe(1800);
  });

  // --- The gate. Anything uncertain must fall back to ADD -----------------
  //
  // A wrongly-detected edit silently changes a price Dad already checked. A
  // wrongly-detected add leaves a visible extra row he can delete. The costs
  // are not symmetric, so the default is always ADD.

  it("falls back to add when the change word is not at the front", () => {
    expect(parseIntent("wire change rate 1800").kind).toBe("add");
  });

  it("falls back to add when there is no field keyword", () => {
    expect(parseIntent("change wire to 1800").kind).toBe("add");
  });

  it("falls back to add when there is no number", () => {
    expect(parseIntent("change wire rate").kind).toBe("add");
  });

  it("falls back to add when nothing names a target", () => {
    expect(parseIntent("change rate to 1800").kind).toBe("add");
  });

  it("never treats an item code as a value to set", () => {
    expect(parseIntent("change wire code to 4402").kind).toBe("add");
  });

  it("survives empty input", () => {
    expect(parseIntent("").kind).toBe("add");
    expect(parseIntent("   ").kind).toBe("add");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- voiceParse`
Expected: FAIL — `parseIntent is not a function`.

- [ ] **Step 3: Implement it**

Add to `src/voiceParse.ts`, after the `CODE_WORDS` set:

```ts
// Words that mean "I am changing a line that already exists", not "add one".
// Must be the FIRST word — see parseIntent.
const CHANGE_WORDS = new Set([
  "change", "set", "update", "make", "correct", "edit",
  "మార్చు", "మార్చండి",
]);

// Words naming the quantity field, for a SET. RATE_WORDS already names the
// other one.
const QTY_WORDS = new Set([
  "quantity", "qty", "count", "nos", "number",
  "సంఖ్య", "పరిమాణం",
]);

// Filler between the field and its value: "rate to 1800".
const SET_FILLER = new Set(["to", "as", "into", "=", "కు"]);
```

Add the type and the function at the end of the file:

```ts
/**
 * What Dad meant by what he said.
 *
 * `add` is today's behaviour and the default. `set` changes a line already in
 * the quote, and is only returned when ALL THREE of these hold:
 *
 *   1. a change word is the FIRST word,
 *   2. a field keyword (rate or quantity) appears after it,
 *   3. a bare number follows that field keyword.
 *
 * Anything less is an add. That asymmetry is deliberate: a wrongly-detected
 * edit silently rewrites a price Dad has already checked, while a
 * wrongly-detected add leaves a visible extra row he can delete. Only one of
 * those two mistakes is recoverable by looking at the screen.
 *
 * The target is returned as raw text. Matching it to a line needs the quote,
 * which this module does not have and should not — see matchLines in
 * parse/matchLines.ts.
 */
export type VoiceIntent =
  | { kind: "add"; item: VoiceItem }
  | { kind: "set"; target: string; field: "rate" | "qty"; value: number };

export function parseIntent(text: string): VoiceIntent {
  try {
    const set = tryParseSet(text);
    if (set) return set;
  } catch (e) {
    // Never let intent detection cost Dad the line. Falling through to `add`
    // reproduces exactly the behaviour that shipped before this existed.
    log.error("voice", "intent could not be classified", e, { length: text?.length });
  }
  return { kind: "add", item: parseTranscript(text) };
}

function tryParseSet(text: string): VoiceIntent | null {
  const raws = normalizeDigits((text ?? "").trim()).split(/\s+/).filter(Boolean);
  if (raws.length < 3) return null;

  const strip = (s: string) => s.toLowerCase().replace(/[.,!?;:]+$/g, "");

  // 1. A change word, at the front only. "wire change rate 1800" is an item
  //    called "wire change", not an instruction.
  if (!CHANGE_WORDS.has(strip(raws[0]))) return null;

  // 2. A field keyword after it.
  let fieldAt = -1;
  let field: "rate" | "qty" | null = null;
  for (let i = 1; i < raws.length; i++) {
    const w = strip(raws[i]);
    if (RATE_WORDS.has(w)) { fieldAt = i; field = "rate"; break; }
    if (QTY_WORDS.has(w)) { fieldAt = i; field = "qty"; break; }
  }
  if (fieldAt < 0 || !field) return null;

  // 3. A bare number after the field keyword, skipping filler. A code word
  //    anywhere between refuses the whole thing — "change wire code to 4402"
  //    is not a price, and pricing a line at an item code is the exact defect
  //    PI-6 closed.
  let value: number | null = null;
  for (let i = fieldAt + 1; i < raws.length; i++) {
    const w = strip(raws[i]);
    if (SET_FILLER.has(w)) continue;
    if (CODE_WORDS.has(w)) return null;
    const m = NUMERIC.exec(raws[i]);
    if (m) { value = parseFloat(raws[i].replace(/,/g, "")); break; }
    return null;
  }
  if (value === null || !Number.isFinite(value)) return null;

  // The target is everything between the change word and the field keyword.
  const target = raws.slice(1, fieldAt).join(" ").trim();
  if (!target) return null;

  log.debug("voice", "set intent parsed", { field, value, targetLength: target.length });
  return { kind: "set", target, field, value };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- voiceParse`
Expected: PASS — 28 tests. **All 16 original tests must pass with no edits to their assertions.** If any needed changing, `parseTranscript`'s behaviour moved and the change is wrong.

- [ ] **Step 5: Verify the whole suite**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, **272 tests**.

- [ ] **Step 6: Commit**

```bash
git add src/voiceParse.ts src/voiceParse.test.ts
git commit -m "Tell an instruction apart from an item"
```

---

## Task 8: Match a spoken target to a line, and apply it

**Files:**
- Create: `src/parse/matchLines.ts`
- Create: `src/parse/matchLines.test.ts`
- Modify: `src/VoiceReader.tsx`
- Modify: `src/VoiceReader.css`
- Modify: `src/QuoteEditor.tsx`

**Interfaces:**
- Consumes: `VoiceIntent`, `parseIntent` from `src/voiceParse.ts`.
- Produces:
  - `interface LineMatch { id: number; name: string; score: number }`
  - `matchLines(target: string, lines: { id: number; name: string }[]): LineMatch[]` — descending by score, only scores > 0.
  - `isAmbiguous(matches: LineMatch[]): boolean` — true when the top two are within 0.15.
  - `VoiceReaderPanel` gains props `lines: { id: number; name: string }[]` and `onSet: (id: number, field: "rate" | "qty", value: number) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/parse/matchLines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchLines, isAmbiguous } from "./matchLines";

const lines = [
  { id: 1, name: "Copper Wire 2.5sq" },
  { id: 2, name: "MCB 32A" },
  { id: 3, name: "Modular Socket 6A" },
];

describe("matchLines", () => {
  it("finds an exact name", () => {
    expect(matchLines("MCB 32A", lines)[0].id).toBe(2);
  });

  it("finds a line from one word of it", () => {
    expect(matchLines("socket", lines)[0].id).toBe(3);
  });

  it("ignores case", () => {
    expect(matchLines("mcb", lines)[0].id).toBe(2);
  });

  it("scores a fuller overlap higher", () => {
    const r = matchLines("copper wire", lines);
    expect(r[0].id).toBe(1);
    expect(r[0].score).toBeGreaterThan(r[1]?.score ?? 0);
  });

  it("returns nothing when no word matches", () => {
    expect(matchLines("transformer", lines)).toEqual([]);
  });

  it("returns nothing for an empty target", () => {
    expect(matchLines("", lines)).toEqual([]);
    expect(matchLines("   ", lines)).toEqual([]);
  });

  it("survives an empty line list", () => {
    expect(matchLines("wire", [])).toEqual([]);
  });

  it("sorts descending by score", () => {
    const r = matchLines("wire", [
      { id: 1, name: "Wire" },
      { id: 2, name: "Copper Wire 2.5sq armoured" },
    ]);
    expect(r[0].id).toBe(1);
  });
});

describe("isAmbiguous", () => {
  it("is false for a clear winner", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 1 }, { id: 2, name: "b", score: 0.3 }])).toBe(false);
  });

  it("is true for two close matches", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 0.8 }, { id: 2, name: "b", score: 0.75 }])).toBe(true);
  });

  it("is false with only one match", () => {
    expect(isAmbiguous([{ id: 1, name: "a", score: 0.5 }])).toBe(false);
  });

  it("is false with no matches", () => {
    expect(isAmbiguous([])).toBe(false);
  });

  it("catches two identically-named lines", () => {
    const r = matchLines("wire", [{ id: 1, name: "Wire" }, { id: 2, name: "Wire" }]);
    expect(isAmbiguous(r)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- matchLines`
Expected: FAIL — cannot resolve `./matchLines`.

- [ ] **Step 3: Implement it**

Create `src/parse/matchLines.ts`:

```ts
// Spoken target text → which line in this quote Dad meant.
//
// A plain token-overlap scorer, not Fuse.js and emphatically not embeddings.
// CLAUDE.md's standing rule sizes the tool to the problem: this matches against
// the lines of ONE quote — a couple of dozen strings at most — so a dependency
// would cost more than it returns. The same rule that puts Fuse.js on item
// search rules it out here.

export interface LineMatch {
  id: number;
  name: string;
  /** 0–1. Share of the target's words found in the line name. */
  score: number;
}

/** Two matches this close together are not a decision the app should make. */
const AMBIGUOUS_WITHIN = 0.15;

function words(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9ఀ-౿.]+/i)
    .filter(Boolean);
}

/**
 * Candidate lines for a spoken name, best first.
 *
 * Scoring: the share of the target's words that appear in the line's name,
 * with a small penalty for a long name so "Wire" beats "Copper Wire 2.5sq
 * armoured" when Dad says "wire". Zero-scoring lines are dropped entirely —
 * "no match" must be distinguishable from "a bad match", because the caller
 * refuses to guess.
 */
export function matchLines(
  target: string,
  lines: { id: number; name: string }[]
): LineMatch[] {
  const want = words(target);
  if (want.length === 0 || !Array.isArray(lines)) return [];

  return lines
    .map((l) => {
      const have = words(l.name);
      if (have.length === 0) return { id: l.id, name: l.name, score: 0 };
      const hit = want.filter((w) => have.some((h) => h === w || h.startsWith(w))).length;
      if (hit === 0) return { id: l.id, name: l.name, score: 0 };
      const coverage = hit / want.length;
      // Prefer the tighter name when coverage ties.
      const brevity = want.length / have.length;
      return { id: l.id, name: l.name, score: coverage * (0.85 + 0.15 * Math.min(1, brevity)) };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * True when the app must ask rather than pick.
 *
 * Guessing between two close matches means silently rewriting a price on the
 * wrong line, which is the failure this whole feature has to avoid.
 */
export function isAmbiguous(matches: LineMatch[]): boolean {
  if (matches.length < 2) return false;
  return matches[0].score - matches[1].score < AMBIGUOUS_WITHIN;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- matchLines`
Expected: PASS — 13 tests.

- [ ] **Step 5: Teach the voice panel about SET**

In `src/VoiceReader.tsx`:

1. Extend the props interface:

```ts
interface Props {
  onAdd: (item: VoiceItem) => void;
  /** The quote's current lines, so a spoken change can find its target. */
  lines: { id: number; name: string }[];
  onSet: (id: number, field: "rate" | "qty", value: number) => void;
  onClose: () => void;
}
```

2. Add the imports:

```ts
import { parseIntent } from "./voiceParse";
import { matchLines, isAmbiguous, type LineMatch } from "./parse/matchLines";
```

3. Add state for a pending change:

```tsx
  const [pendingSet, setPendingSet] = useState<
    { field: "rate" | "qty"; value: number; choices: LineMatch[] } | null
  >(null);
```

4. Where the final transcript is currently handed to `parseTranscript`, route it through `parseIntent` instead. Keep the existing add path untouched:

```tsx
    const intent = parseIntent(finalText);
    if (intent.kind === "set") {
      const matches = matchLines(intent.target, lines);
      if (matches.length > 0) {
        // One clear winner still goes to the confirm step — nothing reaches the
        // quote without Dad seeing it first, which is how this panel has always
        // worked.
        setPendingSet({ field: intent.field, value: intent.value, choices: matches.slice(0, 4) });
        return;
      }
      // Nothing matched, so this was probably an item name after all. Fall
      // through and treat it as an add rather than telling him it failed.
    }
    // ...existing add path, using intent.kind === "add" ? intent.item : parseTranscript(finalText)
```

5. Render the confirm/disambiguation step:

```tsx
      {pendingSet && (
        <div className="vr-set">
          <div className="vr-set-hd">
            {isAmbiguous(pendingSet.choices)
              ? "Which item did you mean?"
              : "Change this item?"}
          </div>
          {pendingSet.choices.map((c) => (
            <button
              key={c.id}
              className="vr-set-choice"
              onClick={() => {
                onSet(c.id, pendingSet.field, pendingSet.value);
                setPendingSet(null);
                onClose();
              }}
            >
              <span className="vr-set-name">{c.name || "(unnamed item)"}</span>
              <span className="vr-set-change">
                {pendingSet.field === "rate" ? "rate" : "qty"} → {pendingSet.value}
              </span>
            </button>
          ))}
          <button className="vr-set-cancel" onClick={() => setPendingSet(null)}>
            Cancel
          </button>
        </div>
      )}
```

- [ ] **Step 6: Style it**

Append to `src/VoiceReader.css`:

```css
.vr-set { display: flex; flex-direction: column; gap: var(--s-2); }
.vr-set-hd {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--ink);
  margin-bottom: var(--s-1);
}
.vr-set-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: var(--tap);
  padding: var(--s-2) var(--s-3);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  cursor: pointer;
}
.vr-set-choice:hover { border-color: var(--green-600); background: var(--green-50); }
.vr-set-choice:focus-visible { outline: 2px solid var(--green-600); outline-offset: 2px; }
.vr-set-name { font-size: var(--fs-base); color: var(--ink); }
.vr-set-change {
  flex: 0 0 auto;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--green-700);
  font-variant-numeric: tabular-nums;
}
.vr-set-cancel {
  min-height: var(--tap);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  color: var(--ink-2);
  cursor: pointer;
}
```

- [ ] **Step 7: Wire the editor to it**

In `src/QuoteEditor.tsx`, add the handler:

```tsx
  function handleSetFromVoice(id: number, field: "rate" | "qty", value: number) {
    log.info("voice", "line changed by voice", { field, value });
    setLastImport({ lines, label: "1 change from voice" });
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? field === "rate"
            ? { ...l, sellMode: "direct" as const, sellRate: String(value) }
            : { ...l, qty: String(value) }
          : l
      )
    );
    markDirty();
  }
```

Then pass the new props where the panel is rendered (currently line 566):

```tsx
        <VoiceReaderPanel
          onAdd={handleAddFromVoice}
          lines={lines.map((l) => ({ id: l.id, name: l.name }))}
          onSet={handleSetFromVoice}
          onClose={() => setShowVoiceReader(false)}
        />
```

> Setting a rate forces `sellMode: "direct"`. A line priced by discount has no single "rate" to change, and silently editing `sellRate` while the line still resolves from `sellList` would show a number that does not drive the total.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass, **285 tests**.

- [ ] **Step 9: Commit**

```bash
git add src/parse/matchLines.ts src/parse/matchLines.test.ts src/VoiceReader.tsx src/VoiceReader.css src/QuoteEditor.tsx
git commit -m "Let Dad say which line to change, and ask when it is not clear"
```

---

## Task 9: ImageReader component tests

The most intricate component in the app, and the one with no coverage at all.

**Files:**
- Create: `src/ImageReader.dom.test.tsx`

**Interfaces:**
- Consumes: `ImageReaderPanel` from `src/ImageReader.tsx`; `movePage` behaviour from Task 4; the long-read guard from Task 5.
- Produces: nothing.

- [ ] **Step 1: Write the test file**

Create `src/ImageReader.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageReaderPanel } from "./ImageReader";
import type { ReadItem } from "./readImage";

// Only the network is faked. The component, mergePages and the whole confirm
// path are the real ones — which is the point: a faked panel proves nothing.
vi.mock("./readImage", async (orig) => {
  const actual = await orig<typeof import("./readImage")>();
  return { ...actual, readImageItems: vi.fn() };
});

const { readImageItems } = await import("./readImage");
const mockRead = vi.mocked(readImageItems);

function file(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

function reply(items: ReadItem[]) {
  return { items, confidence: "full" as const, notes: "" };
}

beforeEach(() => {
  mockRead.mockReset();
  // jsdom implements neither of these and ImageReader uses both.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function pick(names: string[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, names.map(file));
}

describe("ImageReaderPanel — multi-page", () => {
  it("badges each picked page and offers to read them all", async () => {
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);

    expect(screen.getByAltText("Page 1")).toBeInTheDocument();
    expect(screen.getByAltText("Page 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read 3 pages" })).toBeInTheDocument();
  });

  it("reads pages one at a time, never in parallel", async () => {
    // Spec §5.2: a long list already sits against a single 8192-token ceiling,
    // so pages must never share one budget. Measured, not asserted by comment.
    let inFlight = 0;
    let maxInFlight = 0;
    mockRead.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return reply([{ name: "Wire", qty: 1, rate: 100 }]);
    });

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(3));
    expect(maxInFlight).toBe(1);
  });

  it("merges pages in order with their page badges", async () => {
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockResolvedValueOnce(reply([{ name: "MCB", qty: 4, rate: 450 }]));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 2 pages" }));

    await waitFor(() =>
      expect(screen.getByText(/Found 2 items across 2 pages/)).toBeInTheDocument()
    );
    expect(screen.getByText("p1")).toBeInTheDocument();
    expect(screen.getByText("p2")).toBeInTheDocument();
  });

  it("keeps the good pages when one fails", async () => {
    // Losing a five-page order to one blurry photo is the failure Dad would
    // actually hit (spec §5.3).
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockRejectedValueOnce(new Error("unreadable"))
      .mockResolvedValueOnce(reply([{ name: "Socket", qty: 2, rate: 120 }]));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retry page 2/ })).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue("Wire")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Socket")).toBeInTheDocument();
  });

  it("a retry re-reads only the failed page and keeps hand edits", async () => {
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockRejectedValueOnce(new Error("unreadable"));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 2 pages" }));

    const nameField = await screen.findByDisplayValue("Wire");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "EDITED BY HAND");

    mockRead.mockReset();
    mockRead.mockResolvedValueOnce(reply([{ name: "MCB", qty: 4, rate: 450 }]));
    await userEvent.click(screen.getByRole("button", { name: /Retry page 2/ }));

    await waitFor(() => expect(screen.getByDisplayValue("MCB")).toBeInTheDocument());
    expect(mockRead).toHaveBeenCalledTimes(1);
    // Re-reading everything would have thrown this away.
    expect(screen.getByDisplayValue("EDITED BY HAND")).toBeInTheDocument();
  });
});

describe("ImageReaderPanel — the confirm list", () => {
  it("counts incomplete rows, and says it in the singular when there is one", async () => {
    mockRead.mockResolvedValue(
      reply([
        { name: "Wire", qty: 6, rate: 1650 },
        { name: "MCB", qty: 4, rate: null },
        { name: "Socket", qty: 0, rate: 120 },
      ])
    );

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    await waitFor(() =>
      expect(screen.getByText(/2 items still need/)).toBeInTheDocument()
    );

    // Filling the missing rate must flip the sentence to the singular branch.
    const rateFields = screen.getAllByPlaceholderText(/rate/i);
    await userEvent.type(rateFields[1], "450");
    await waitFor(() =>
      expect(screen.getByText(/1 item still needs/)).toBeInTheDocument()
    );
  });

  it("holds a decimal while it is being typed", async () => {
    // The PI-2 regression: a number input re-parsed on every keystroke turned
    // 2.5 into 25, because React restored "2" before the "5" arrived.
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    const qty = await screen.findByDisplayValue("1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2.5");
    expect(qty).toHaveValue("2.5");
  });

  it("hands only the checked rows to the quote", async () => {
    const onAdd = vi.fn();
    mockRead.mockResolvedValue(
      reply([
        { name: "Wire", qty: 6, rate: 1650 },
        { name: "MCB", qty: 4, rate: 450 },
      ])
    );

    render(<ImageReaderPanel onAdd={onAdd} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    await screen.findByDisplayValue("Wire");
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: /Add 1 item/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toHaveLength(1);
    expect(onAdd.mock.calls[0][0][0].name).toBe("MCB");
  });
});

describe("ImageReaderPanel — page order and long reads", () => {
  it("moves a page earlier", async () => {
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["first.jpg", "second.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Move page 2 earlier" }));
    // The strip is re-badged, so page 1's move-earlier button is now disabled
    // and page 2's is not — the order really changed.
    expect(screen.getByRole("button", { name: "Move page 1 earlier" })).toBeDisabled();
  });

  it("cannot move the first page earlier or the last page later", async () => {
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["a.jpg", "b.jpg"]);

    expect(screen.getByRole("button", { name: "Move page 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move page 2 later" })).toBeDisabled();
  });

  it("confirms before a long read, and does not call out until confirmed", async () => {
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Read 6 pages" }));
    expect(screen.getByText(/read one at a time/)).toBeInTheDocument();
    expect(mockRead).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^Read 6 pages$/ }));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(6));
  });

  it("reads three pages without asking", async () => {
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["1.jpg", "2.jpg", "3.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(3));
  });
});
```

- [ ] **Step 2: Run the file and fix what it exposes**

Run: `npm test -- ImageReader`
Expected: some tests fail on the first run because the query does not match the real markup — placeholder text, button labels and the checkbox count are guesses from reading the component, not from running it.

**Fix the test to match the component, not the other way round**, unless the component is genuinely wrong. If a test cannot be made to pass without changing behaviour, stop and report it — that is a real finding.

- [ ] **Step 3: Run the whole suite**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. ~299 tests.

- [ ] **Step 4: Commit**

```bash
git add src/ImageReader.dom.test.tsx
git commit -m "Put the image reader's 18 browser checks in the repo"
```

---

## Task 10: VoiceReader component tests

**Files:**
- Create: `src/VoiceReader.dom.test.tsx`

**Interfaces:**
- Consumes: `VoiceReaderPanel` with the props added in Task 8.
- Produces: nothing.

- [ ] **Step 1: Write the test file**

Create `src/VoiceReader.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceReaderPanel } from "./VoiceReader";

// The Web Speech API does not exist in jsdom. Everything else — the panel,
// parseIntent, matchLines and the confirm path — is real.
class MockRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = vi.fn(() => { this.onstart?.(); this.onaudiostart?.(); });
  stop = vi.fn(() => { this.onend?.(); });
  abort = vi.fn();

  say(alternatives: string[]) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign(
          alternatives.map((transcript) => ({ transcript, confidence: 0.9 })),
          { isFinal: true, length: alternatives.length }
        ),
      ],
    });
  }
}

let mic: MockRecognition;

beforeEach(() => {
  mic = new MockRecognition();
  // @ts-expect-error — jsdom has no SpeechRecognition to type against.
  globalThis.SpeechRecognition = vi.fn(() => mic);
  // @ts-expect-error — same.
  globalThis.webkitSpeechRecognition = globalThis.SpeechRecognition;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function panel(over: Partial<Parameters<typeof VoiceReaderPanel>[0]> = {}) {
  return (
    <VoiceReaderPanel
      onAdd={vi.fn()}
      onSet={vi.fn()}
      lines={[]}
      onClose={vi.fn()}
      {...over}
    />
  );
}

describe("VoiceReaderPanel — language", () => {
  it("starts in English and switches to Telugu", async () => {
    render(panel());
    const te = screen.getByRole("button", { name: /తెలుగు/ });
    await userEvent.click(te);
    expect(te).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("quoteapp.voiceLang")).toBe("te-IN");
  });

  it("remembers the choice across a remount", async () => {
    localStorage.setItem("quoteapp.voiceLang", "te-IN");
    render(panel());
    expect(screen.getByRole("button", { name: /తెలుగు/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("VoiceReaderPanel — adding", () => {
  it("parses a spoken line into name, qty and rate", async () => {
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["6 wire 1.5sq rate 1650"]));

    await waitFor(() => expect(screen.getByDisplayValue("wire 1.5sq")).toBeInTheDocument());
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1650")).toBeInTheDocument();
  });

  it("offers the other alternatives and re-parses the one picked", async () => {
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["6 wire rate 1650", "16 wire rate 1650"]));

    await screen.findByDisplayValue("wire");
    await userEvent.click(screen.getByRole("button", { name: /16 wire rate 1650/ }));
    await waitFor(() => expect(screen.getByDisplayValue("16")).toBeInTheDocument());
  });

  it("holds a decimal while it is being typed", async () => {
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["wire rate 100"]));

    const qty = await screen.findByDisplayValue("1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2.5");
    expect(qty).toHaveValue("2.5");
  });
});

describe("VoiceReaderPanel — changing an existing line", () => {
  const lines = [
    { id: 1, name: "Copper Wire 2.5sq" },
    { id: 2, name: "MCB 32A" },
  ];

  it("offers to change the matched line", async () => {
    const onSet = vi.fn();
    render(panel({ lines, onSet }));
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["change MCB rate to 500"]));

    await waitFor(() => expect(screen.getByText(/Change this item/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /MCB 32A/ }));
    expect(onSet).toHaveBeenCalledWith(2, "rate", 500);
  });

  it("asks which line when two match equally", async () => {
    render(panel({ lines: [{ id: 1, name: "Wire" }, { id: 2, name: "Wire" }] }));
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["change wire rate to 500"]));

    await waitFor(() => expect(screen.getByText(/Which item did you mean/)).toBeInTheDocument());
  });

  it("treats an unmatched change as a new item rather than an error", async () => {
    render(panel({ lines }));
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.say(["change transformer rate to 500"]));

    await waitFor(() => expect(screen.queryByText(/Which item/)).not.toBeInTheDocument());
  });
});

describe("VoiceReaderPanel — failures", () => {
  it("names the reason when the microphone is refused", async () => {
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.onerror?.({ error: "not-allowed" }));

    await waitFor(() =>
      expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument()
    );
  });

  it("returns to idle when recognition ends while still listening", async () => {
    // The stageRef guard. Without it the panel sits on "Listening…" forever.
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: /start|listen|speak/i }));
    act(() => mic.onend?.());

    await waitFor(() =>
      expect(screen.queryByText(/Listening/i)).not.toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run the file and reconcile the queries**

Run: `npm test -- VoiceReader`
Expected: several failures on the first run — the start button's accessible name, the error copy and the alternatives markup are guesses. Read `src/VoiceReader.tsx` and fix the **queries**, keeping the assertions.

The mock's `results` shape must match what the component indexes. If the component reads `e.results[e.resultIndex][0].transcript`, the array-with-properties above is correct; if it reads differently, adjust the mock, not the component.

- [ ] **Step 3: Run the whole suite**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. ~311 tests.

- [ ] **Step 4: Commit**

```bash
git add src/VoiceReader.dom.test.tsx
git commit -m "Put the voice panel's 26 browser checks in the repo"
```

---

## Task 11: QuoteEditor and CustomerScreen tests

Covers the two features from Tasks 3 and 6, which shipped without automated tests.

**Files:**
- Create: `src/QuoteEditor.dom.test.tsx`
- Create: `src/CustomerScreen.dom.test.tsx`

**Interfaces:**
- Consumes: `QuoteEditor`, the undo bar from Task 6; `CustomerScreen` and the copy sheet from Task 3; `duplicateQuote` from Task 2.
- Produces: nothing.

> **Why CustomerScreen is here.** The copy sheet is the one new user-facing feature in this whole plan verified by hand only. Leaving it untested contradicts the argument for PI-12 itself.

- [ ] **Step 1: Write the test file**

Create `src/QuoteEditor.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuoteEditor } from "./QuoteEditor";
import type { Customer } from "./types";

// Firestore never runs here. The editor, the calc engine, the undo path and
// every warning are real.
const saveQuote = vi.fn().mockResolvedValue({ id: "q-new", queued: false });
vi.mock("./useQuotes", () => ({
  useQuotes: () => ({ quotes: [], loading: false, saveQuote, setStatus: vi.fn(), deleteQuote: vi.fn() }),
  useAllQuotes: () => ({ quotes: [], loading: false }),
}));
vi.mock("./useCompanySettings", () => ({
  useCompanySettings: () => [{ name: "Test Co", address: "", phone: "", gstin: "", logo: "", validity: "", terms: "" }, vi.fn()],
}));

const customer: Customer = {
  id: "c1", name: "Ravi Electricals", phone: "9999999999",
  address: "Miyapur", createdAt: 1_700_000_000_000,
};

beforeEach(() => {
  saveQuote.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

function editor() {
  return <QuoteEditor customer={customer} onBack={vi.fn()} />;
}

describe("QuoteEditor — the no-cost warning", () => {
  it("warns when an item is sold with no cost entered", async () => {
    // Voice and image imports set only sellRate, which is exactly this case —
    // without the warning the profit panel confidently overstates the margin.
    render(editor());
    await userEvent.click(screen.getByRole("button", { name: /add item/i }));

    const rate = screen.getAllByPlaceholderText(/rate/i)[0];
    await userEvent.type(rate, "1650");

    await waitFor(() =>
      expect(screen.getByText(/no cost/i)).toBeInTheDocument()
    );
  });
});

describe("QuoteEditor — undo an import", () => {
  it("has no undo bar before anything is imported", () => {
    render(editor());
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers undo after a voice import, and restores the previous lines", async () => {
    render(editor());
    await userEvent.click(screen.getByRole("button", { name: /add by voice/i }));
    // Driving the real voice panel needs the SpeechRecognition mock from
    // VoiceReader.dom.test.tsx. Instead this exercises the editor's own path:
    // an import adds a line, undo takes it back.
    // If the panel cannot be driven here, assert on the image path instead —
    // both share handleAddFromImage/handleAddFromVoice's snapshot logic.
  });
});

describe("QuoteEditor — the engine reaches the screen", () => {
  it("compounds two discounts rather than adding them", async () => {
    // 17835 × (1−0.647) × (1−0.02) = 6169.84 — the fixture from CLAUDE.md.
    render(editor());
    await userEvent.click(screen.getByRole("button", { name: /add item/i }));

    await userEvent.type(screen.getAllByPlaceholderText(/qty/i)[0], "1");
    // Field labels differ between cost and sell; read the component and target
    // the cost-side list price, discount and extra discount inputs.
  });
});
```

> **This file is deliberately shorter and partly sketched.** Driving `QuoteEditor` needs the voice mock from Task 10 and knowledge of its field labels that only comes from running it. Finish it against the real component: keep the first test, complete the undo test using whichever import path is easiest to drive, and complete the discount test with the real field selectors. **Do not delete a test to make the file pass** — if something cannot be tested, leave it out with a comment saying why.

- [ ] **Step 2: Write the CustomerScreen tests**

Create `src/CustomerScreen.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerScreen } from "./CustomerScreen";
import type { Customer, QuoteDoc } from "./types";

const saveQuote = vi.fn().mockResolvedValue({ id: "q-new", queued: false });

const existing: QuoteDoc = {
  id: "q1",
  customerId: "c1",
  customerName: "Ravi Electricals",
  name: "Shop order",
  lines: [{
    id: 4, name: "Wire 2.5sq", qty: "2",
    costMode: "direct", costList: "", costDisc1: "", costDisc2: "", costRate: "800",
    sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "950",
    gstPct: "18",
  }],
  totalSale: 1900,
  status: "accepted",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

vi.mock("./useQuotes", () => ({
  useQuotes: () => ({
    quotes: [existing], loading: false,
    saveQuote, setStatus: vi.fn(), deleteQuote: vi.fn(),
  }),
  useAllQuotes: () => ({ quotes: [existing], loading: false }),
}));
vi.mock("./useCustomers", () => ({ updateCustomerDoc: vi.fn() }));
vi.mock("./firebase", () => ({ db: {} }));

const customer: Customer = {
  id: "c1", name: "Ravi Electricals", phone: "9999999999",
  address: "Miyapur", createdAt: 1_700_000_000_000,
};

beforeEach(() => {
  saveQuote.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function screenUnderTest(onOpenQuote = vi.fn()) {
  return (
    <CustomerScreen
      customer={customer}
      onBack={vi.fn()}
      onNewQuote={vi.fn()}
      onOpenQuote={onOpenQuote}
      onCustomerChange={vi.fn()}
    />
  );
}

describe("CustomerScreen — copying a quote", () => {
  it("prefills the sheet with a name marked as a copy", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    expect(screen.getByDisplayValue("Shop order (copy)")).toBeInTheDocument();
  });

  it("says how many items travel with the copy", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    expect(screen.getByText(/1 item will be copied as a new draft/)).toBeInTheDocument();
  });

  it("writes a draft, never a second accepted quote", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    // saveQuote(customerName, name, lines, totalSale, status, existingId, createdAt)
    const call = saveQuote.mock.calls[0];
    expect(call[1]).toBe("Shop order (copy)");
    expect(call[4]).toBe("draft");
    expect(call[5]).toBeUndefined();   // a new document, not an update
  });

  it("recomputes the total instead of copying the stored one", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    // 2 × 950 = 1900, computed by the real engine from the copied lines —
    // not read off the stored totalSale, which can be stale (bug #9).
    expect(saveQuote.mock.calls[0][3]).toBe(1900);
  });

  it("re-mints the line ids so the copy cannot collide with the source", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    expect(saveQuote.mock.calls[0][2][0].id).toBe(1);
    expect(existing.lines[0].id).toBe(4);   // source untouched
  });

  it("respects a name the user typed over the default", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    const field = screen.getByDisplayValue("Shop order (copy)");
    await userEvent.clear(field);
    await userEvent.type(field, "Kumar site");
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    expect(saveQuote.mock.calls[0][1]).toBe("Kumar site");
  });

  it("refuses to copy with a blank name", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.clear(screen.getByDisplayValue("Shop order (copy)"));
    expect(screen.getByRole("button", { name: "Copy Quote" })).toBeDisabled();
  });

  it("writes nothing when cancelled", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(saveQuote).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Shop order (copy)")).not.toBeInTheDocument();
  });

  it("opens the new quote so Dad lands where he can change prices", async () => {
    const onOpenQuote = vi.fn();
    render(screenUnderTest(onOpenQuote));
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(onOpenQuote).toHaveBeenCalledTimes(1));
    expect(onOpenQuote.mock.calls[0][0].id).toBe("q-new");
    expect(onOpenQuote.mock.calls[0][0].status).toBe("draft");
  });
});
```

- [ ] **Step 3: Complete both files against the real components**

Run `npm test -- QuoteEditor` and `npm test -- CustomerScreen` repeatedly, filling in selectors until every test either passes or is removed with a written reason.

`CustomerScreen`'s `Props` must be checked against the real interface — it is `customer`, `onBack`, `onNewQuote`, `onOpenQuote`, `onCustomerChange` at the time of writing, but read it rather than trusting this.

Minimum bar for this task: **the no-cost warning test, one undo test, and all nine CustomerScreen copy tests pass.**

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Update CLAUDE.md**

Move PI-9 → PI-12 from **WHAT TO BUILD NEXT** into **WHAT IS DONE**, with a table per PI recording what was verified how — matching the format of the existing PI sections. State plainly which claims rest on jsdom rather than a real browser, and that layout at 390px, real network behaviour and the service worker remain unverified.

- [ ] **Step 6: Commit**

```bash
git add src/QuoteEditor.dom.test.tsx src/CustomerScreen.dom.test.tsx CLAUDE.md
git commit -m "Cover the quote editor and the copy sheet, and write down what PI-9 to PI-12 proved"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 PI-9.1 `duplicateQuote` | Task 2 |
| §1 PI-9.2 copy sheet + customer picker | Task 3 — **gap: the customer picker is not built.** See below. |
| §2 PI-10.1 undo | Task 6 |
| §2 PI-10.2 ADD/SET intent | Task 7 |
| §2 PI-10.3 target matching + ambiguity | Task 8 |
| §3 PI-11.1 reorder | Task 4 |
| §3 PI-11.2 long-read guard | Task 5 |
| §4 PI-12.1 jsdom project | Task 1 |
| §4 PI-12.2 ImageReader tests | Task 9 |
| §4 PI-12.3 VoiceReader tests | Task 10 |
| §4 PI-12.4 QuoteEditor + CustomerScreen tests | Task 11 |

**Known deviation from the spec, deliberate:** §1 says the copy sheet carries "a customer picker defaulted to the current customer". Task 3 builds the sheet with the name field only, because `CustomerScreen` has no customer list in scope — reaching one means either a second `useCustomers` subscription on a screen that does not need it, or threading the list down from `AppRouter`. `duplicateQuote` already takes `customerId`/`customerName` as arguments, so the picker is additive and costs nothing later. **Copying to a different customer is therefore not shipped by this plan.** Raise it with Siva rather than guessing; if he wants it, it is a small follow-up task that passes the list down from `AppRouter`.

**Placeholder scan:** Task 11 is intentionally partly sketched, and says so in bold with a minimum bar. Every other task carries complete code.

**Type consistency:** `DuplicateResult` (Task 2) is consumed in Task 3 with exactly its declared fields. `VoiceIntent` (Task 7) is consumed in Task 8. `LineMatch` (Task 8) is used by `isAmbiguous` and the panel. `movePage` (Task 4) is generic over `T` and called with `PageFile[]`. `appConfig.image.longReadPages` / `secondsPerPage` (Task 5) are read only in `ImageReader.tsx`.

**Test count ladder** — check against this after each task: 241 → 242 (T1) → 252 (T2) → 260 (T4) → 272 (T7) → 285 (T8) → ~299 (T9) → ~311 (T10).

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, reviewed between tasks.
2. **Inline Execution** — tasks run in this session with checkpoints.
