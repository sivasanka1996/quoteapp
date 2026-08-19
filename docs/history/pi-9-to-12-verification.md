# PI-9 → PI-12 — verification record

Evidence tables moved out of `CLAUDE.md` on 2026-08-19. **Nothing here was
edited.**

Covers PI-9 (Duplicate a quote), PI-10 (Voice undo + edit), PI-11 (Finish
the image path) and PI-12 (Browser checks into the repo).

> Moved from `CLAUDE.md`, which remains the plan, the decisions and the
> current state. This file is the evidence behind the "DONE" claims there.
> See [`CLAUDE.md`](../../CLAUDE.md) and [`DESIGN.md`](../../DESIGN.md).

---

### PI-9 — Duplicate a quote — DONE and VERIFIED 2026-08-18

| Item | How it was verified | Result |
|---|---|---|
| `duplicateQuote` (`src/types.ts`) — fresh line ids from 1, status forced to `draft`, name gets " (copy)" (or "Copy of Untitled" for a blank/legacy-"Untitled" source), `totalSale` deliberately absent | 10 unit tests: TDD red (`duplicateQuote is not a function`) then green; a deep-copy test confirms mutating a copied line cannot reach the source array | **PASS** |
| Copy sheet on `CustomerScreen` — ⧉ button per row, prefilled `"<name> (copy)"`, item count, Cancel writes nothing | 9 jsdom component tests in `CustomerScreen.dom.test.tsx` (written in the same task as this write-up — PI-12 §12.4): prefill, item count, cancel-writes-nothing all pass against the real component | **PASS (jsdom)** |
| Recomputes the total rather than trusting stale `totalSale` (bug #9 guard) | Component test: the fixture's stored `totalSale` (1900) is deliberately stale against its own line (3 × ₹950 = 2850), so a passing assertion of 2850 cannot be a coincidental match on the stored value. Mutation-tested against the real discriminator: `CustomerScreen.tsx`'s `confirmCopy` was temporarily changed to pass `copying.totalSale` (the stale stored value) instead of `totals.totalSale` — the test went red (`expected 1900 to be 2850`), then the source was restored and re-verified clean. (An earlier version of this fixture had the stored and recomputed totals coincidentally equal, which review caught — see the fix report in the task's report file for how that was found and closed.) | **PASS (jsdom), mutation-tested against the real regression** |
| Always writes a new `draft` document, never overwrites or re-accepts the source | Component test asserts `status === "draft"` and `existingId === undefined` even though the source quote's `status` is `"accepted"` | **PASS (jsdom)** |
| Re-mints every line id so a copy cannot collide with its source | Component test asserts the copy's first line has `id === 1` while the source's untouched line keeps `id === 4`. Mutation-tested — asserting `id === 4` on the copy fails | **PASS (jsdom), mutation-tested** |
| Lands Dad in the new quote, ready to change prices | Component test: `onOpenQuote` is called once with the new id and `status: "draft"` | **PASS (jsdom)** |
| 390px layout, the button really being ≥48×48, the sheet looking right on a phone | **Not performed — no browser in this environment**, in either the task that built the sheet or the task that tested it | **UNVERIFIED** |

**Known non-uniqueness trap, avoided rather than hit:** the copy button's
`aria-label` is `` `Copy quote ${name}` ``, which is **not unique** once two
quotes share a name (both "Untitled" is the common case). The component
tests use a single fixture named "Shop order", so they are safe as written —
but do not copy this selector pattern onto a fixture with duplicate or blank
names without scoping to the row first.

### PI-10 — Voice undo + edit — DONE 2026-08-18, never proven at a microphone

| Item | How it was verified | Result |
|---|---|---|
| One-step Undo bar after a voice or image import (`lastImport` snapshot, `QuoteEditor.tsx`) | 2 jsdom component tests: no Undo bar before any import; an image import shows "Added 1 item from image.", the row lands, Undo removes it and restores the empty state | **PASS (jsdom)** |
| Undo is one step, not a stack — a second import overwrites the snapshot | Design-level: accepted, not separately pinned by a test in this plan. A hand-edit made to a *pre-existing* row between an import and Undo is also reverted, because the snapshot is the whole `lines` array — reviewed and accepted (not silent: Dad sees the screen change and nothing has reached Firestore yet) | **ACCEPTED BY DESIGN** |
| The snapshot survives a **failed** save and clears only on a **successful** one | Traced by hand: `setLastImport(null)` sits in the `try` block after `setSavedAt`, not in `catch` or `finally`. Not separately unit-tested | **VERIFIED BY CODE READING** |
| `parseIntent` classifies `add` vs `set` — a change word at the front, then a field keyword, then a number, refusing an item code in between | 30 `voiceParse.test.ts` tests (16 original + 14 new), including a red-then-green check on the `CODE_WORDS` guard inside the value-scanning loop — which turned out to be **provably unreachable** given the surrounding fallthrough (documented in-code rather than deleted, as insurance against a future loosening of that fallthrough) | **PASS** |
| `matchLines`/`isAmbiguous` — token-overlap scoring, disambiguation when the top two scores are within 0.15 | 13 `parse/matchLines.test.ts` tests | **PASS** |
| The full "say a change, get asked which line, tap one" flow reaches the screen | 3 of `VoiceReader.dom.test.tsx`'s 11 tests, against the real component with only `SpeechRecognition` faked: offers to change the matched line and reports it through `onSet`; asks which line on a tie; falls through to an ordinary add on an unmatched target. Mutation-tested (see PI-12) | **PASS (jsdom), mutation-tested** |
| Rate changes force `sellMode: "direct"` | Traced by hand in `handleSetFromVoice`: a discount-priced line has no single "rate" to overwrite, so a spoken rate change switches the line to direct pricing rather than writing a number that would not drive the total. Not separately unit-tested | **VERIFIED BY CODE READING** |
| Recognition actually hears a spoken "change" correctly, in a real accent, in a real room | **Not performed.** jsdom has no Web Speech API at all — every test here fakes `SpeechRecognition` entirely | **UNVERIFIED — needs a human at a microphone** |

### PI-11 — Finish the image path — DONE 2026-08-18, logic verified; layout unverified

| Item | How it was verified | Result |
|---|---|---|
| `movePage<T>` (`src/parse/movePage.ts`) — pure, never throws, same array reference on any refused move | 8 unit tests (TDD red then green): a real move, a no-op (`from === to`), and every out-of-range case (negative, past the end, empty array) | **PASS** |
| ▲▼ reorder controls in `ImageReader.tsx`, disabled at the first/last page, `resetRead()` fired only on a genuine move | 2 of `ImageReader.dom.test.tsx`'s 12 tests: moving page 2 earlier changes the **merged item order** (mock keyed by file identity, not call order — see PI-12's Task-9 fix below); the two boundary buttons are disabled with no click at all | **PASS (jsdom)** |
| A page-badge/▲▼-button visual collision, found by the implementer reading the CSS by hand (not seen in a browser) | Fixed before review: `.ir-page-move` moved from the bottom-left corner (where it overlapped `.ir-page-num`'s `p1`/`p2` badge) to the free bottom-right corner | **FIXED, unverified visually** |
| A side effect (`resetRead()`) called from inside the `setPages` state updater — a React purity rule `StrictMode` exists to catch | Fixed before review: the move is now computed outside the updater, `setPages` and `resetRead()` fired as separate statements | **FIXED** |
| 6-page-or-more confirmation ("N pages… about M seconds, keep the app open") before a long sequential read; below 6, reads immediately | `appConfig.image.longReadPages = 6`, `secondsPerPage = 3` (`config/app.config.ts`, citing the 2026-08-12 live measurements of 2.9s/3.9s/2.4s per page). 2 of `ImageReader.dom.test.tsx`'s 12 tests: at 6 pages, clicking Read shows the confirmation copy and makes **zero** network calls until confirmed; below 6, reading starts immediately with no prompt | **PASS (jsdom)** |
| The confirmation's arithmetic | `Math.round((6 × 3) / 5) × 5 = 20` seconds, checked by hand against the brief's own worked example. **Not asserted by a test** — the two long-read tests in `ImageReader.dom.test.tsx` check `/read one at a time/` and the call count only, never the seconds figure | **PASS (by hand)** |
| 390px layout: does the confirmation look right, do the ▲▼ buttons register as taps, does the corner fix actually clear the badge on screen | **Not performed — no browser** in either the implementing task or the testing task | **UNVERIFIED** |

### PI-12 — Browser checks into the repo — DONE 2026-08-18

**The point of this PI:** `CLAUDE.md` used to record 88 browser checks across
PI-8, ImageReader, VoiceReader and customer editing, and **not one of those
harnesses was ever committed** — every table said "the harness is not in the
repo," so the checks were real history and completely unrepeatable.
`ImageReader.tsx` and `VoiceReader.tsx` — multi-page state, sequential reads,
partial failure, retry preserving hand edits, the whole voice confirm/change
flow — had **zero automated coverage** before this PI. `QuoteEditor`'s undo
bar and `CustomerScreen`'s copy sheet (both PI-9/PI-10, above) shipped with
none either.

| Item | How it was verified | Result |
|---|---|---|
| A second Vitest *project*, `dom` (jsdom), alongside the existing `unit` (node) — `src/**/*.dom.test.tsx` only, so nothing already pure silently starts depending on a DOM | `vite.config.ts` `test.projects`; a one-test smoke check (`src/smoke.dom.test.tsx`) renders a button and asserts it; the 241 pre-existing node tests kept passing unedited | **PASS** |
| `ImageReader.dom.test.tsx` — 12 tests against the real `ImageReaderPanel`, `mergePages`, `movePage`; only `readImageItems` faked | Sequential-not-parallel measured with an in-flight counter (`maxInFlight === 1` across 3 pages, not just asserted by comment); partial-page-failure keeps the good pages; retry re-reads only the failed page **and** keeps a hand edit made to a surviving row; page reorder changes the merged order; the 6-page confirm gate | **PASS (jsdom)** |
| `VoiceReader.dom.test.tsx` — 11 tests against the real `VoiceReaderPanel`; only `SpeechRecognition` faked (a constructible mock — the brief's first draft used a non-constructible arrow function and threw) | Language toggle + persistence; add/alternatives/decimal-entry/Add-gating; all 3 of the new change-a-line flow (Task 8); mic-refused; a stale `onend` after an error is a no-op. 3 branches mutation-tested directly in `VoiceReader.tsx` (guard removed, set-intent disabled, set-intent widened), each reverted after confirming the right tests and only those went red | **PASS (jsdom), mutation-tested** |
| `CustomerScreen.dom.test.tsx` — 9 tests, written this task, pinning PI-9's copy sheet | See the PI-9 table above. 2 of the 9 (recomputed total, re-minted line id) were mutation-tested against the real component; the other 7 are single-assertion checks with no branching logic to misfire | **PASS (jsdom); 2/9 mutation-tested** |
| `QuoteEditor.dom.test.tsx` — 4 tests, written this task | See below. 3 of the 4 (no-cost warning, undo restores lines, discount compounding) were mutation-tested; the 4th ("no undo bar before anything is imported") is the negative control the other undo test needs to mean anything | **PASS (jsdom); 3/4 mutation-tested** |
| Genuine defect found: a test that could not fail | `ImageReader.dom.test.tsx`'s original "moves a page earlier" asserted only that the page-1 "move earlier" button stays disabled — true unconditionally, before and after the click, on a completely no-op `reorderPage`. Fixed to assert the merged item order instead, keyed by **which file** was read rather than call order (a mock keyed by call order was tried first and shown, empirically, to also pass against a neutered `reorderPage`) | **FOUND AND FIXED** |
| Genuine defect found: a test factually wrong about the component | `VoiceReader.dom.test.tsx`'s draft asserted that recognition ending while still listening (nothing said, not stopped) returns the panel to idle. Traced by hand and confirmed by running it: the real component **restarts the mic** (capped at 5 restarts) and stays on "Listening…". Replaced with a test of what the `stageRef` guard is actually for — a stale `onend` after the stage has moved on (e.g. to an error) must be a no-op | **FOUND AND FIXED** |

**`QuoteEditor.dom.test.tsx` — what each of the 4 tests covers, and one
defect fixed in the brief's own draft:**

| Test | What it proves | Notes |
|---|---|---|
| Warns when an item is sold with no cost entered | The profit-panel warning (`.qe-profit`) fires once a freshly-added line has a sell rate **and** a qty, both typed through the real sheet | The brief's draft typed only a rate, never a qty. The warning is gated on `lineSaleTotal > 0`, so a ₹0-total line correctly shows **no** warning — the draft as written could never have gone green. Fixed by also typing qty; mutation-tested by removing the qty line again and confirming the test then fails |
| No Undo bar before anything is imported | The negative case, so the positive case below means something | — |
| Offers Undo after an import, and restores the previous lines | Drives the real `ImageReaderPanel` (upload → read → Add), confirms the undo bar names the import, then confirms Undo removes the line and returns to the empty state | The brief suggested the voice path, which needs Task 10's `SpeechRecognition` mock; used the image path instead since both share the same `lastImport` snapshot logic. Mutation-tested (asserting the line survives Undo fails, as expected) |
| Compounds two discounts rather than adding them | Types the CLAUDE.md fixture (17835, 64.7%, 2%) into the real cost-side sheet fields and reads `6,169.84` back off the rendered per-unit price | Mutation-tested against the *additive* result (5,938.85) to confirm the test would catch a regression to adding instead of compounding |

**Test count:** 310 tests were the floor going into this task (241 baseline +
1 smoke + 10 duplicateQuote + 8 movePage + 14 voiceParse/parseIntent + 13
matchLines + 12 ImageReader.dom + 11 VoiceReader.dom). Adding the 9
CustomerScreen.dom and 4 QuoteEditor.dom tests brings the suite to **323
tests, all passing** — confirmed by two full `npm test` runs (no jsdom
worker-startup flake on either), `npm run lint` clean, `npm run build` clean.

**A jsdom flake is characterised, not fixed, and worth knowing about.** The
first `npm test` run after a cold checkout can drop the *entire* `dom`
project with a `[vitest-pool-runner]: Timeout waiting for worker to respond`
error — it fails **loudly** (non-zero exit, an explicit error, a whole
project missing) rather than silently under-reporting a green suite, so it
cannot be mistaken for a quiet pass. It was **sighted in three separate
tasks** (Tasks 1, 2 and 5) — hit along the way while those tasks were doing
something else — but **deliberately reproduced against an untouched baseline
by stashing changes and re-running only once**, in Task 3. That one
stash-and-rerun is the baseline confirmation; the three sightings corroborate
that the flake is real but are not repeated repro attempts in their own right.
It self-resolves on a second run, and is believed to be this
machine's OneDrive-synced path plus jsdom's many small files tripping a pool
startup timeout on first touch — not a config defect. Re-run once before
trusting a red `dom` project.
