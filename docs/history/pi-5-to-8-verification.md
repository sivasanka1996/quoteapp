# PI-5 → PI-8 — verification record

Evidence tables moved out of `CLAUDE.md` on 2026-08-19. **Nothing here was
edited.**

Covers PI-5 (Observability), PI-6 (Parsing), PI-7 (Pluggable AI provider)
and PI-8 (Multi-page slips). The decisions locked with Siva on 2026-08-10,
the one-config-file change, and the test-environment rule stayed in
`CLAUDE.md` because they are standing instructions rather than history.

> Moved from `CLAUDE.md`, which remains the plan, the decisions and the
> current state. This file is the evidence behind the "DONE" claims there.
> See [`CLAUDE.md`](../../CLAUDE.md) and [`DESIGN.md`](../../DESIGN.md).

---

### PI-5 — Observability — DONE 2026-08-10

Shipped first, as planned, because it is the instrument for PI-6/7/8. 41 new
unit tests (182 total, up from 104). Two items cannot be unit-tested in
`environment: 'node'` and are recorded honestly as **manual**, not dressed up
as tests.

| Item | How it was verified | Result |
|---|---|---|
| Levels + debug gating | Unit tests: `debug` dropped with the flag off and kept with it on; `info`/`warn`/`error` always kept; scope, message and `ts` recorded. | **PASS** |
| The debug flag | `detectDebug` is pure and tested against both inputs: `?debug=1`, `?foo=bar&debug=1`, the stored `quoteapp.debug`, and every "off" case. A **throwing** `localStorage` (private mode) returns off rather than crashing, and the URL still wins when storage throws. | **PASS** |
| Ring buffer | Pushing 2100 records leaves exactly 2000, oldest evicted, newest last. The ~1 MB byte cap evicts before the record cap is reached. A single oversized record is **kept**, not evicted to nothing. `all()` returns a copy, so a caller cannot corrupt the ring. | **PASS** |
| The logger cannot crash the app | A sink that throws does not escape `log.info`, and circular data does not either. This is the whole safety argument for logging from inside catch blocks. | **PASS** |
| Error normalising | An `Error` becomes `{name, message, stack}`; a thrown string still yields a usable record; no `err` key when none was passed. | **PASS** |
| Export format | Filename shape `quoteapp-error-2026-08-10T14-23-07.log`, no colons (illegal on Windows, where Siva opens them). Fixed columns stay aligned across every level and scope. `error` selects warn+error; `info` selects everything including debug. | **PASS** |
| `calc/engine.ts` re-throws | All 23 original engine tests pass **unchanged** after wrapping — the wrapping is behaviour-preserving. The catch logs once at the innermost frame (a symbol marker stops `calcQuote → calcLine → resolvePrice` writing the same failure three times) and then re-throws. | **PASS** |
| Worker logging | 6 new worker tests: one `read complete` line carrying provider, model, itemCount, confidence and ms; every line of one request shares an `rid`; the Flash→Pro escalation is recorded as warn-then-info; a refused origin is noted; `LOG_LEVEL=silent` silences it. | **PASS (no live API call)** |
| No stack reaches the client | The `/list` branch awaits `fetch` with no guard of its own, so a throw there reaches the top-level handler. Test asserts the response is `{"error":"Image reading failed. Please try again."}` with status 500 and **no** trace of the message or file in the body — while the worker's own log keeps the full detail. | **PASS** |
| IndexedDB persistence | **Cannot be unit-tested** — `environment: 'node'` has no `indexedDB`, so `idb.ts` short-circuits and the tests never touch it. Checked instead in **Chromium against the built app**: the `quoteapp-logs` database is created alongside Firestore's own, holds records written by the real boot path, and each has the documented `{ts, level, scope, msg}` shape. | **PASS (browser)** |
| The log survives a reload | Same run: record count went 1 → 2 across a reload, so `restorePersistedLogs` really does bring the previous session back. This is the whole reason for persisting — the log worth reading is the one from *before* the crash. | **PASS (browser)** |
| The export download | Clicked **Export everything** and opened the file that landed: named `quoteapp-info-2026-08-10T11-06-26.log`, no colon in it, and the first line read `2026-08-10T11:05:49.439Z  INFO   ui         app started  {"url":"/"}` — the documented column layout, from a real download rather than a formatter test. **Export problems** produced `quoteapp-error-…` containing no INFO lines. | **PASS (browser)** |
| The Diagnostics panel | Renders in settings at 390px, reports a live record count, and the toggle flips `aria-pressed` and writes `quoteapp.debug=1`. | **PASS (browser)** |
| `?debug=1` end to end | A fresh tab opened at `/?debug=1` with **no stored flag** captured debug records. This is the form Siva talks Dad through on the phone, so it mattered that it works from the URL alone. | **PASS (browser)** |

**The logger never throws, and that is load-bearing.** Every public entry point
is wrapped, each sink is guarded individually, and `data` is put through a JSON
round-trip on the way in — which both guarantees `structuredClone` will survive
the IDB write and turns a circular reference into a caught error *at the log
call* rather than a mysterious rejection later. Failure is silent by design.

**Why IndexedDB and not a folder.** A browser cannot write to a directory —
spec D1/D2. The File System Access API would come closest and was rejected
because Android Chrome does not support it, so it could never work for Dad, who
is the only user who matters here.

**One real defect was found while wiring the ladder, and then fixed properly —
bug #10, closed 2026-08-10.** [HomeScreen.tsx](../../src/HomeScreen.tsx) `handleAdd`
had **no catch at all**, so a rejection left the button on "Saving…" forever and
lost what Dad had typed — PI-1's exact failure mode, still live in the
add-customer path a full PI after it was fixed for quotes.

The first pass only made it loud. That was the wrong call and Siva said so:
the fix was a known pattern already proven in this codebase, so deferring it
bought nothing. `addCustomer` now mints its id on the device with `doc()`,
writes with `setDoc`, and races the ack — exactly what `saveQuote` does.

Two things came out of doing it properly:

- **The ack race now lives in [`src/firestoreAck.ts`](../../src/firestoreAck.ts)**,
  shared by both call sites instead of copied. It had never had a test of its
  own despite being the thing standing between Dad and a hung button; it has
  **6 now**, including one that pins the `write.catch(() => {})` line — it looks
  like dead code and is not, because without it a write that fails *after* the
  timeout is an unhandled rejection.
- **`serverTimestamp()` was also wrong here.** It reads back as `null` from the
  local cache until the server confirms, while `Customer.createdAt` is declared
  `number`. Nothing read the field, so nothing noticed. It is `Date.now()` now,
  matching quotes.

**Proved red-then-green in a real browser, offline.** Against the old code the
sheet sat on "Saving…" past 8s and never navigated; against the fix it released
in **2624ms** — the `ACK_TIMEOUT_MS` path — navigated into the new customer,
survived a reload while still offline, and the queued write drained when the
connection came back. 7 checks.

> **Harness note worth keeping:** the first version of that check waited for
> `button:has-text('Add Customer')` to detach and "passed" in 52ms against the
> *broken* code — the label merely flips to "Saving…", so the selector matched
> nothing and the wait succeeded instantly. Watch the sheet, not the button. A
> check that cannot fail is worse than no check, which is why this one was run
> against the old code first.

### PI-6 — Remove the fragile parsing regex — DONE 2026-08-10

31 new unit tests. **All 9 original `voiceParse` tests and all 23 original
`engine` tests pass unchanged** — that is the proof the rewrite preserved
behaviour rather than replacing it.

| Item | How it was verified | Result |
|---|---|---|
| `"six wire rate 1650"` → qty **6** | Was qty 1: the old rule required a leading *digit*. Now a classification rule, and tested. | **PASS** |
| `"wire 6 nos rate 1650"` → qty **6** | Was qty 1: the quantity was not at the front, so nothing looked for it. A number followed by a unit word is now a quantity wherever it sits. | **PASS** |
| `"2 wire code 4402"` → rate **null** | Was rate 4402 — an item code read as a price, the worst kind of wrong because it looks deliberate. A code keyword before a trailing number refuses the trailing-number rule. | **PASS** |
| `"twenty five wire rate 1650"` → qty **25** | Multi-token numbers join for the two patterns people say (tens+unit, hundreds), and only those. | **PASS** |
| `"6 nos wire rate 1650"` → name `wire` | The unit word is consumed with the quantity rather than left in the item name. | **PASS** |
| **Regression guard (spec §3.4)** | `"6 wire 1.5sq rate 1650"` still gives qty 6, name `wire 1.5sq`, rate 1650. And `"2.5 sq wire"` still parses as qty **1** with the decimal kept in the *name* — because "1.5 sq" and "2.5 sq" are item names in this trade. Teaching the qty rule decimals would turn a correct parse into a wrong one. | **PASS** |
| Number words, both languages | 17 tests: English units, teens, tens and hundred; Telugu 1–19 (11–19 did not exist before), tens and వంద; case and trailing punctuation ignored; `"twenty-five"` hyphenated; unknown words → `null`. | **PASS** |
| Both tables always consulted | Deliberate: the recogniser returns English digits and words in `te-IN` mode, so the language setting is not trusted for numbers. Tested in both directions. | **PASS** |
| `"six six"` does **not** become 12 | Greedy addition would do that; only tens+unit and hundreds patterns join. Two quantities said in a row is far likelier than someone meaning twelve that way. | **PASS** |
| Money stops round-tripping through text | `PriceMode` now carries `discounts: number[]`. 8 new engine tests, including one that resolves the whole fixture **both ways and asserts the same rupee**. | **PASS** |
| Data-URL split hardened | 6 tests: a URL with no comma, an empty payload, `null`, and an `ArrayBuffer` each raise a readable error instead of yielding `undefined`. | **PASS** |

**`parseDiscountChain` is still exported and still tested** — it parses
*typed* input, which is a real job. What changed is that nothing internal
round-trips through it: the editor passes `discountsFromPercents(d1, d2)`
straight through, and `"64.7% + 2%"` is built only for display. `PriceMode`
accepts either, preferring numbers, which is why the 23 original engine tests
needed no edits.

**What none of this proves: that Chrome hears Dad's Telugu correctly.** Every
test here feeds `parseTranscript` a string. Recognition quality needs a mic and
a human voice, and stays Siva's to check — spec §7.

### PI-7 — Pluggable AI provider — DONE 2026-08-10, NOT DEPLOYED

24 new worker tests (55 total). **Gemini remains the default and nothing about
Dad's experience changes** — this buys the ability to change model without a
deploy, and nothing else, until there is evidence to change it.

| Item | How it was verified | Result |
|---|---|---|
| The Gemini move was pure | All **25 original worker tests pass with zero edits to their assertions**. That was the acceptance condition in the plan: if a test had needed changing, the move would not have been pure. | **PASS** |
| The contract holds | 17 provider tests: the request carries the model, a base64 image part and a JSON response format; malformed JSON, an empty reply, HTTP 429, a network throw and a valid-but-wrong-shape reply each yield `items: []` with `detail` set and **never** a throw. That "never throws" is what lets the router have no try/catch around the read. | **PASS (no live API call)** |
| Both providers normalise identically | The blank-name drop, the null-rate rule and fractional quantities are asserted on the OpenRouter path too, against the shared `schema.js`. A model comparison is meaningless if the two paths clean up differently. | **PASS** |
| `AI_PROVIDER` routes | End to end through `worker.fetch`: unset → Gemini's endpoint; `openrouter` → OpenRouter's; `GEMINI` (wrong case) → Gemini. | **PASS** |
| A typo cannot break a read | `AI_PROVIDER=gemeni` returns **200** from Gemini and logs `unknown AI_PROVIDER, falling back`. A typo in an env var must never be why Dad cannot read a slip standing in a shop. | **PASS** |
| The right key is demanded | With `AI_PROVIDER=openrouter` and no key, the error names `OPENROUTER_API_KEY`, not the Gemini one. | **PASS** |
| The new files are actually linted | `cf-worker/**/*.js` is recursive, but that was **checked rather than assumed** — an unused variable planted in `schema.js` was caught by `npm run lint`, then removed. PI-4.7 fixed exactly this class of silent skip once already. | **PASS** |

**Nothing here is live.** `cf-worker/` deploys by hand with `npx wrangler deploy`
and has not been deployed — so PI-3, PI-4.2, PI-5's worker logging and all of
PI-7 are still absent from production, and per spec §0.1 **the deployed worker
is still the pre-PI-4.2 one that answers anyone.** One deploy ships all of it.

**Switched to OpenRouter 2026-08-10, on Siva's call.** `wrangler.toml` now sets
`AI_PROVIDER = "openrouter"` with `qwen/qwen3.5-flash-02-23`. Gemini remains the
*code-level* fallback, so a deleted or misspelled var lands back on it — but as
configured, the next deploy stops using Gemini.

**~~The model the spec named does not exist.~~ WRONG — corrected 2026-08-12 by
a live read; see "The real AI read" above.** This paragraph used to say
`qwen/qwen3.7-flash` was absent from the catalogue and would have 400'd on the
first real read. It is in the catalogue, it takes images, it is *half* the price
of the model that replaced it, and pointed at the mock slips it read every
number correctly. The 2026-08-10 "re-fetch" recorded here did not establish what
it claimed. The advice below stands and is the reason the error was catchable —
it was simply not followed at the time. **Verify a model id against the live
catalogue before setting one, and before writing a note saying one is missing:**

```bash
curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*"'
```

**Cost still is not what decides this.** Every candidate is cents a month at
Dad's volume. **Telugu accuracy on his handwriting decides it**, and nothing has
compared them on real input yet — that needs [`HUMAN-TASKS.md`](../../HUMAN-TASKS.md)
§4's photos. Next rung up if Qwen3.5-Flash disappoints: `qwen/qwen3.6-flash`.
Rolling back to Gemini is `AI_PROVIDER = "gemini"` in the Cloudflare dashboard,
no deploy.

**Keys live in `.env`, which is gitignored — settings do not.** Siva's split,
2026-08-11: `.env` is the **reference sheet** of every secret a real environment
needs, so standing up prod is reading down one file instead of remembering.
Everything non-secret — model, provider, limits, URL — is in
`config/app.config.ts`.

**`.gitignore` was fixed first, and checked before a single key was written.**
`*.local` did **not** match a bare `.env`, so the file would have been
committed. `.env`, `.env.*` are now ignored with `!.env.example` excepted;
verified with `git check-ignore` for `.env`, `.env.local` and `.env.production`.

**Nothing reads `.env` at runtime, and it says so at the top.** Vite would
compile any value into the public bundle, and the Worker never sees it at all.
The values have to be copied to where each consumer actually reads them —
`wrangler secret put` for the Worker, `cf-worker/.dev.vars` for local Worker
dev, GitHub repo secrets for Actions. Each entry in `.env` names its
destination.

### PI-8 — Multi-page slips — DONE and VERIFIED 2026-08-10

9 unit tests on the pure merge, plus 18 checks driving the **built** app in
Chromium at 390px. Only the image proxy was faked, so the component,
`readImageItems`, `mergePages` and the whole client path are real. One
throwaway `ZZ-multipage-check-*` customer per run, both deleted afterwards via
the tested cascade helper (0 quotes each — Save was never pressed).

| Item | How it was verified | Result |
|---|---|---|
| Multi-select | The gallery input carries `multiple`; three files produced three thumbnails badged p1/p2/p3 and a button reading "Read 3 pages". | **PASS** |
| **Reads are sequential, not batched** | The fake proxy recorded the start and end of every call. Three calls, and **no call started before the previous one finished** — `3083-3333 3350-3610 3623-3875`. This is spec §5.2's requirement measured rather than asserted: one 8192-token budget per page, never shared. | **PASS** |
| Progress | "Reading page 2 of 3…" while it worked. | **PASS** |
| Merge order and badges | Four items across three pages arrived in page order, each row badged p1/p2/p2/p3, header reading "Found 4 items across 3 pages". | **PASS** |
| **Partial failure keeps the good pages** | Page 2 of 3 forced to fail: pages 1 and 3 still offered with their real page numbers, and an inline "⚠ Page 2 could not be read. Retry page 2". Losing a five-page order to one blurry photo is the failure Dad would actually hit (spec §5.3). | **PASS** |
| Retry re-reads only that page | Exactly **one** proxy call, and its items slotted back into page order. | **PASS** |
| **A retry does not cost Dad his typing** | A row on a surviving page was edited to "EDITED BY HAND" before retrying; after the retry it was still there, with page 2's fresh rows inserted around it. Re-reading everything would have thrown that away. | **PASS** |
| Nothing renders broken | No uncaught page errors across the whole run. | **PASS** |

**A defect the browser check found was in the harness, not the app** — worth
recording because the first run looked like a real bug. The fake proxy keyed
its reply by *call ordinal*, so on retry it served page 1's items while the app
correctly labelled them page 2. The app was right; the fixture was wrong. The
three fixture images are byte-identical, so the harness has to be told which
page it is serving — it cannot infer it from the request.

**What this still does not check:** a real Gemini response to a real multi-page
slip. The proxy was faked, so this proves the *client* handles pages correctly,
not that the model reads page 3 of Dad's handwriting. That closes on the first
real multi-page read after the worker is deployed.
