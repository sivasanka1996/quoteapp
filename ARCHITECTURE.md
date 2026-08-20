# Quotation App — Architecture, Before and Now

*Written 2026-08-20, against `feature/Vision_Draft` @ `f8fb2af`. Every tree and
count below was read out of the working tree, not remembered.*

**Where this file sits among the others.** [`README.md`](README.md) is the
sixty-second introduction. [`DESIGN.md`](DESIGN.md) is the reference manual —
data model, deploy topology, runbook. [`CLAUDE.md`](CLAUDE.md) is the plan and
the decision log. **This file is the one that explains the shape**: what the
system is made of, why each piece is that size, and what it grew out of.

---

## 1. What the app actually is, in technical terms

Skip this and the rest of the document reads as arbitrary. Almost every
structural decision here falls out of three facts about the problem.

### 1.1 The business logic: every line has two prices, not one

Dad is a middleman in electrical materials. A customer asks for forty 6mm² wire
coils; he buys them from a vendor and supplies them on. He does not have a
price list of his own — both sides of the deal are quoted as *discounts off the
same manufacturer's list price*, and his income is the gap between them.

So a single quote line carries **two complete, independent pricing structures**:

```
one line item — "6.0 sqmm FR wire, 40 coils"
│
├── COST side   — what the vendor charges him
│   ├── mode: discount   → list 17,835 × (1 − 0.647) × (1 − 0.02)  = 6,169.84
│   └── mode: direct     → a rate he was simply quoted
│
└── SELL side   — what he charges the customer
    ├── mode: discount   → same list price, a smaller discount chain
    └── mode: direct     → a rate he decided
```

Three consequences follow immediately, and they are visible everywhere in the
code:

1. **`UILine` has fourteen fields, not five** — a `costMode`/`sellMode` pair,
   and a full `list`/`disc1`/`disc2`/`rate` set on each side. It is not
   over-modelled; it is the smallest shape that can hold the deal.
2. **Discounts compound, never add.** `64.7% + 2%` is `×0.353 ×0.98`, not
   `×0.333`. Getting this wrong misprices every quote in the same direction,
   quietly. It is why [`src/calc/engine.ts`](src/calc/engine.ts) is a pure
   module with no UI and no network, and why it carries the densest test
   coverage in the repo.
3. **GST is pass-through.** It is charged to the customer and handed to the
   government; it touches `grandTotal` and never touches `grossProfit`. The
   engine computes them on separate paths so the two cannot be conflated.

### 1.2 One document, two audiences — enforced by the compiler

The same quote is rendered twice. The **business view** shows cost, sell, GST
and per-line profit. The **customer view** shows the sell side only, on company
letterhead, and is what gets shared over WhatsApp.

A cost figure leaking into the customer view is the worst bug this app could
have — it would show a customer exactly how much he is being marked up. That
risk is therefore *not* managed with CSS classes or conditional rendering.
`CustomerView` accepts a `CustomerLine[]`, **a type that has no cost field at
all**. Leaking a margin is not a bug you can write here; it is a type error.

### 1.3 The operating environment: one man, one phone, bad signal

The user is Dad — non-technical, mobile-first, Telugu-speaking, often standing
in a half-built basement with no bars. The realistic failure modes are **losing
a quote** and **reading a wrong number**. They are not attackers, traffic
spikes, or query cost, and the architecture is deliberately not hardened
against those. Concretely, this is where these come from:

- **Offline-first Firestore** with an IndexedDB persistent cache, so a cold
  start with no signal still lists customers and quotes.
- **`firestoreAck.ts`** — Firestore resolves a write only on *server* ack, so
  `await`ing one offline hangs the button forever. Every write that drives a
  button races a 2.5s timeout and reports "saved, will sync" instead.
- **Three ways in** — typing, photographing a handwritten slip, or speaking —
  because typing forty lines on a phone in a shop is not a real option.
- **Wrong beats crashed, so crash instead.** Every layer catches and degrades
  *except* the calc engine, which logs and **re-throws** so a math failure
  surfaces as a recovery card rather than a plausible-looking wrong total.

---

## 2. The system now — runtime topology

There is **no application server**. No FastAPI, no uvicorn, no Node backend.
The browser talks to managed Firestore directly; the only thing resembling a
server is a 145-line Cloudflare Worker whose entire job is to hold an API key
the browser must not see.

```
Dad's phone / laptop
│
├── PWA shell  (service worker, installed to home screen)
│   └── React 19 SPA — the whole app
│       │
│       ├── state: React useState only. No Redux, no Zustand, no router lib.
│       │   AppRouter holds one `screen` union; navigation is a setState.
│       │
│       ├── local storage
│       │   ├── localStorage ──── company details, voice language
│       │   └── IndexedDB ─┬───── Firestore offline cache (quotes, customers)
│       │                  └───── log ring buffer (2000 records / ~1 MB)
│       │
│       └── network
│           │
│           ├──► Firebase Firestore  (managed, Spark free tier)
│           │      onSnapshot listeners; writes queue offline and drain later
│           │      collections: customers/{id}, quotes/{id}
│           │
│           ├──► Cloudflare Worker   quoteapp-image-reader.…workers.dev
│           │      │   the ONLY server-side code we own — ~500 lines total
│           │      │   holds the model API key; refuses any origin but the app
│           │      │
│           │      └──► AI provider, chosen by env var (rollback ≠ deploy)
│           │             ├── gemini      Flash → Pro retry   [default, proved]
│           │             └── openrouter  qwen3.5-flash       [opt-in]
│           │
│           └──► Web Speech API  ← in-browser. No server, no model of ours.
│                  Recognition happens on the device/vendor side; we only ever
│                  see the transcript string.
│
└── (deploy path, not runtime)
    GitHub push to main → Actions: lint → 327 tests → build → Firebase Hosting
    Worker ships separately, BY HAND: `npx wrangler deploy`
```

**Two deploy paths that keep getting conflated.** The web app ships only from
`main`, through CI. The Worker ships from a laptop, from any branch, and goes
live for Dad the moment the command finishes. Worker code *committed* on a
branch is not live; worker code *deployed* from a branch is.

---

## 3. Where it started — the v1 tree

The initial commit (`9d6b6bb`) was, structurally, **a calculator with a print
view**. It is worth looking at, because almost every module added since exists
to answer a specific failure of this version.

```
QuoteApp/  ── v1, initial commit
│
├── package.json          deps: react, react-dom.  That is the entire list.
│
├── src/
│   ├── App.tsx           ONE screen. Line items, pricing, totals, all of it.
│   ├── calc/engine.ts    the math — already pure, already tested. The good part.
│   ├── CustomerView.tsx  the printable document
│   ├── CompanySettings.tsx + useCompanySettings.ts   → localStorage
│   ├── format.ts         Indian lakh/crore grouping
│   ├── index.css         styles
│   └── main.tsx
│
├── firebase.json / .firebaserc      hosting configured…
└── .github/workflows/deploy.yml     …and auto-deploying from day one
```

What that tree could not do, in the order it hurt:

| Missing | Consequence for Dad |
|---|---|
| Any quote persistence | **Reload the page and the quote is gone.** No storage of any kind — not even localStorage. |
| Any notion of a customer | One anonymous quote at a time. No history, no "what did I quote him last month". |
| Any input but the keyboard | Forty line items typed by thumb, standing in a shop. |
| Any error handling | A thrown render meant a white screen and no explanation. |
| Any diagnostics | "It didn't work" was the entire bug report, and unactionable. |

The intermediate steps are worth naming, because each is a layer still visible
in today's tree: `1e0086c` added a localStorage quote drawer (single-device,
deleted much later); `7fc9681` replaced it with Firestore and introduced the
four-screen flow; `b293c3a` added image reading as a **single 145-line worker
file with `Access-Control-Allow-Origin: *`**, a prompt that asked for JSON
inside prose, and a regex that hunted a ```` ```json ```` fence out of the
reply; `4116f2a` brought the design-token system and the first voice parser —
three regexes, Telugu number words 1–10 only, and **no English number words at
all**.

---

## 4. Where it is now — the annotated tree

Same repo, twelve product increments later. The annotations say what each
module is *for*, since file names alone do not carry that.

```
QuoteApp/
│
├── config/
│   └── app.config.ts ──── THE one config file. Imported by BOTH halves: Vite
│                          bundles it into the app, wrangler bundles it into
│                          the Worker, so the two cannot drift. Model, token
│                          ceiling, worker URL, origin allowlist, upload size,
│                          log caps, ack timeout. Precedence: env var > file,
│                          so a rollback is a dashboard edit, not a deploy.
│                          Keys are NOT here (public repo) — it names each
│                          secret and the command to set it.
│
├── src/                                       ── the app
│   │
│   ├── main.tsx → ErrorBoundary → App → AppRouter
│   │   AppRouter.tsx ──── the whole router: one discriminated union of screens
│   │                      { home | customer | quote }. Owns useCustomers() so
│   │                      the listener survives navigation and the copy sheet
│   │                      can offer a different customer.
│   │
│   ├── ═══ SCREENS ═════════════════════════════════════════════════════════
│   │   HomeScreen ──────── stat tiles, search, customer rows, APK banner
│   │     └── CustomerScreen ─ quote history, status filter, edit-customer
│   │          │              sheet, and the ⧉ copy sheet (same or DIFFERENT
│   │          │              customer)
│   │          └── QuoteEditor ─ THE business view. Collapsed rows + bottom-
│   │               │           sheet line editor, blanket discount panel,
│   │               │           profit summary, one-step Undo for the last
│   │               │           voice/image import
│   │               └── CustomerView ─ THE customer document. Takes
│   │                                  CustomerLine[] — no cost field exists
│   │                                  on that type. Column toggles, company
│   │                                  letterhead, print, share.
│   │
│   ├── ═══ THE MATH (pure — no UI, no network) ═════════════════════════════
│   │   calc/engine.ts ──── compounding discounts, per-line rounding, totals,
│   │                       GST kept out of profit. Logs and RE-THROWS: a
│   │                       silently wrong total is the one unacceptable
│   │                       outcome, so failure must reach the ErrorBoundary.
│   │   calc/lineInput.ts ─ UILine (all strings, what the editor holds) →
│   │                       LineInput (all numbers, what the engine takes).
│   │                       Lifted out of the component so the copy sheet can
│   │                       total a quote without importing a screen.
│   │   types.ts ────────── UILine / Customer / QuoteDoc + the pure helpers:
│   │                       quoteStatus, seedNextId, hasNoCost, parseQty,
│   │                       customerPatch, duplicateQuote
│   │   format.ts ───────── Indian lakh/crore grouping, short form, dates
│   │
│   ├── ═══ DATA LAYER (Firestore, offline-first) ═══════════════════════════
│   │   firebase.ts ─────── init + persistent IndexedDB cache. `--mode
│   │                       emulator` swaps in a memory cache pointed at
│   │                       localhost, and shouts about it in the console.
│   │   useCustomers.ts ─── CRUD + deleteCustomerAndQuotes (one writeBatch, so
│   │                       a customer and their quotes go together)
│   │   useQuotes.ts ────── per-customer snapshot + saveQuote + copyQuoteTo
│   │   firestoreAck.ts ─── ackOrQueued(). Any write driving a button goes
│   │                       through here, or it hangs offline.
│   │
│   ├── ═══ INPUT PATH 1 — PHOTOGRAPH A SLIP ════════════════════════════════
│   │   ImageReader.tsx ─── multi-page camera/gallery panel, ▲▼ reorder,
│   │                       long-read confirm gate, merged confirm list
│   │   readImage.ts ────── downscale to 1600px, POST to the Worker, honest
│   │                       offline refusal
│   │   parse/mergePages.ts  several pages → one list, page badges, and the
│   │                        failed-page list. One bad photo never loses the
│   │                        other four.
│   │   parse/movePage.ts    one page to a new index; an out-of-range move
│   │                        returns the list untouched rather than losing it
│   │
│   ├── ═══ INPUT PATH 2 — SPEAK ════════════════════════════════════════════
│   │   VoiceReader.tsx ─── mic UI, en-IN/te-IN toggle, warm-up before it
│   │                       invites speech, tap-on/tap-off recording
│   │   voiceParse.ts ───── a TOKENIZER: tokenize → classify (NUM / NUM_WORD /
│   │                       UNIT / RATE_KW / CODE_KW / WORD) → assemble.
│   │                       parseIntent() tells "add a line" from "change that
│   │                       line's rate".
│   │   parse/numberWords.ts   English + Telugu 1–100, both tables always
│   │                          consulted regardless of the language toggle
│   │   parse/matchLines.ts    which existing line did he mean? Token-overlap
│   │                          scoring. isAmbiguous() forces the app to ASK
│   │                          when the top two are within 0.15.
│   │
│   ├── ═══ OUTPUT ══════════════════════════════════════════════════════════
│   │   sharePdf.ts ─────── element → A4 PDF → Web Share API. Rasterised on
│   │                       purpose: jsPDF's fonts cannot render Telugu.
│   │                       pageSlices() breaks pages at ROW boundaries, so a
│   │                       page break cannot guillotine an item row.
│   │
│   ├── ═══ DIAGNOSTICS ═════════════════════════════════════════════════════
│   │   log/logger.ts ───── 4 levels, closed scope union, debug behind a flag
│   │                       Siva can talk Dad into turning on over the phone.
│   │                       NEVER THROWS — it is called from inside catch
│   │                       blocks, so a logger that can crash is worse than
│   │                       no logger at all.
│   │   log/buffer.ts ───── ring buffer, 2000 records / ~1 MB
│   │   log/idb.ts ──────── IndexedDB persistence, batched, fully guarded, so
│   │                       the evidence survives the reload a crash forces
│   │   log/export.ts ───── buffer → timestamped .log file Dad can send
│   │
│   └── *.dom.test.tsx / *.test.ts ─ colocated with what they test
│
├── cf-worker/                                 ── the only server-side code
│   ├── image-reader.js ─── THE ROUTER ONLY: origin allowlist, CORS, request
│   │                       shape, structured logging, and what an empty item
│   │                       list means. Knows nothing about any model.
│   ├── providers/index.js  pickProvider(env). Unknown name → gemini + warn: a
│   │                       typo must never be why a read fails in a shop.
│   ├── providers/gemini.js     Flash → Pro retry. Default, and the only
│   │                           provider ever proved against a real photograph.
│   ├── providers/openrouter.js same contract, opt-in, reasoning explicitly OFF
│   ├── schema.js ───────── the shared prompt + both structured-output
│   │                       dialects + normalize + confidenceOf. Shared so
│   │                       swapping provider cannot quietly change the ask.
│   └── test-support/env.js  env factories. A test STATES the environment it
│                            needs; it never inherits an ambient one.
│
│   THE PROVIDER CONTRACT:  read(imageBase64, mimeType, env, rid) NEVER THROWS.
│   A failure is `items: []` with `detail` set. That is precisely what lets the
│   router carry no try/catch around the read.
│
├── scripts/                                   ── none are *.test.ts, so CI
│   │                                             never runs them
│   ├── repo-sanity.mjs ─── `npm run sanity`: strays, dead modules, unused
│   │                       deps, secret hygiene, doc drift (including the test
│   │                       count in these very docs). Zero deps, read-only.
│   ├── cascade-check.ts ── live cascade-delete check against REAL Firestore
│   ├── openrouter-live-check.ts   drives the REAL worker + REAL model. Costs
│   │                              money — hence never in CI.
│   └── pdf-check.ts ────── builds a real PDF in real Chrome and inspects the
│                           FILE, not the DOM
│
├── docs/
│   ├── superpowers/specs|plans/   design + implementation docs per PI group
│   └── history/                   the verification tables behind every "DONE"
│                                  claim — moved out so CLAUDE.md stays cheap
│                                  to load every session
│
└── CLAUDE.md · DESIGN.md · ARCHITECTURE.md · README.md · TESTING.md · HUMAN-TASKS.md
```

---

## 5. Before → now, feature by feature

The middle column is the mechanism, not the marketing. The right column is the
failure that forced the change — which is the part actually worth carrying
forward.

| Area | Before | Now | Why it moved |
|---|---|---|---|
| **Quote persistence** | Nothing, then localStorage (`QuoteDrawer` + `useQuoteStorage`) | Firestore documents, per customer, synced across devices | localStorage is one device. He quotes on a phone and reviews on a laptop. |
| **Offline** | Default memory cache — no signal meant no first snapshot, so an empty screen | IndexedDB persistent cache + multi-tab manager; writes queue and drain | He works in basements. An empty list looks exactly like lost data. |
| **Saving** | `await setDoc(...)` driving the button | `ackOrQueued()` races a 2.5s ack timeout, reports "saved, will sync" | Firestore resolves only on *server* ack. Offline, the button hung forever. |
| **Customers** | No such concept | `customers` collection, search, stat tiles, editable name/phone/address | The To block on every quotation reads from this record — a wrong phone was reaching customers with no way to fix it. Correcting it fixes quotations **already saved**, because the editor passes the live customer object rather than the quote's denormalised copy. |
| **Quote lifecycle** | A quote just existed | `draft / sent / accepted / declined`, set by hand; badges, filter, home tiles | Nothing infers status; guessing it would be worse than not showing it. Pre-field quotes read `undefined`, so `quoteStatus()` falls back to draft. |
| **Duplicating** | Retype it | `duplicateQuote()` — fresh line ids from 1, status forced to `draft`, total **recomputed** not copied, optional different customer via `copyQuoteTo` | Copying the stored `totalSale` would carry bug #9's stale figure into a brand-new document. Forcing `draft` stops a copied *accepted* quote reading as a second acceptance. |
| **Entering items — hand** | One flat screen of inputs | Collapsed rows + bottom-sheet editor; blanket discount across all or selected lines | Forty rows of fourteen fields does not fit on a phone. |
| **Entering items — photo** | Didn't exist → then one photo, one 145-line worker, `Origin: *`, JSON hunted out of prose with a regex, `confidence` a hardcoded constant | Multi-page: photograph every page, read **sequentially, one call each**, merge into one confirm list with `p2` badges; ▲▼ reorder; a 6-page read confirms first; a failed page retries alone and keeps hand edits on surviving rows. Schema-constrained output, Flash→Pro retry, `confidence` derived from the rows returned. Origin allowlist. | Batching pages shares one 8192-token budget, already the first suspect for an empty read. `Origin: *` on a public repo made the key a free relay. And a fence-hunting regex fails the day the model writes a sentence first. |
| **The prompt** | "return ONLY valid JSON", plus rate guidance the model could reason around | **"NEVER CALCULATE… copied digit for digit"** | A rule the model can weigh against its own commercial intuition is not a rule. The narrower fix passed every font-rendered mock, then put **five wrong rupee figures** on screen from real handwriting — at `confidence: "full"`, so nothing warned him. |
| **Entering items — voice** | Three regexes; Telugu number words 1–10; **no English number words at all** | Tokenizer (tokenize → classify → assemble); English + Telugu 1–100 including "twenty five"; a `CODE_KW` class so an item code is not priced as money; `parseIntent` add-vs-set; `matchLines` picks the line he meant and **asks** when ambiguous | The old chain read `"six wire rate 1650"` as qty 1, and `"2 wire code 4402"` as ₹4402. Each miss needed another branch; token classification composes instead. |
| **The microphone** | `start()`, then "Listening… Speak now" | Mic warmed with `getUserMedia` on open; a `starting` stage refuses to invite speech until `audiostart` fires; interim results shown live; `continuous` on, tap-off to stop | `start()` returns instantly but recording began **3785 ms later** — measured. A two-second order line was over before Chrome was listening. Three plausible theories (network, permission, `te-IN`) were all wrong; **the fix came from instrumenting, not reasoning.** |
| **Undoing an import** | Delete the rows by hand | One-step Undo bar over a `lastImport` snapshot, cleared on successful save | A misread slip added twelve wrong rows. A snapshot, not a stack — one step back is the whole requirement. |
| **AI provider** | Gemini, hardcoded in the worker body | Router + interchangeable providers behind a never-throws contract; `AI_PROVIDER` chooses; prompt and schema shared | **Rollback becomes an env var, not a deploy.** Sharing the prompt is what makes a provider comparison mean anything. |
| **Configuration** | Spread across `.env.local`, `wrangler.toml [vars]`, `wrangler secret`, and constants inlined in five source files | `config/app.config.ts`, imported by both halves; `[vars]` deliberately emptied | Two places to set one value is one place to forget. Emptying `[vars]` is what stops the old split growing back. |
| **Error policy** | None | Layered: UI catches and degrades · I/O logs and re-throws so the retry banner stays honest · **calc logs and re-throws** · ErrorBoundary catches renders · Worker logs fully and returns the shape the client expects | A swallowed calc error is a wrong number on a customer's quotation. That is the one thing worse than a crash. |
| **Diagnostics** | `console.log`, gone on reload | 4 levels, scoped, ring buffer persisted to IndexedDB, `?debug=1`, export to a timestamped `.log` file | "It didn't work" over the phone is unactionable. Now it is an attachment. |
| **PDF** | Fixed-height bands | `pageSlices()` cuts at row boundaries and always sums to the full height | The old maths guillotined item rows through the middle of their glyphs. Rasterised rather than text, because jsPDF cannot render Telugu at all. |
| **Types** | `qty` parsed with `parseInt` in five places | `parseQty` (fractional metres survive), `seedNextId` (loaded lines keep their ids), `CustomerLine` with no cost field | `parseInt("2.5")` billed 2.5 m of wire as 2 m — silently, in the customer's favour, in five separate places. |
| **Tests** | 2 files: engine + format | **327 across 21 files**, two Vitest *projects* | See §7 — and note carefully what they still do not cover. |
| **CI** | Build + deploy | Lint → test → build → deploy, on push to `main` only | Nothing on a feature branch is live. A push to `main` deploys to Dad immediately. |

---

## 6. Tech stack — what each piece does, and what it stands in for

Read the last column. The rejected options are the load-bearing part: this is a
local app with about two users, and the recurring temptation is to build for a
scale that does not exist.

| Layer | Choice | Its actual job here | Deliberately not |
|---|---|---|---|
| UI | **React 19 + TypeScript** | Four screens; types carry the domain invariants (`CustomerLine` has no cost field) | — |
| Build | **Vite 8** | Dev server, production bundle, **and the only real typecheck** (`tsc -b` across three tsconfigs) | `npx tsc --noEmit` checks *nothing* here — the root tsconfig is a solution file holding only `references` |
| State | **`useState` + one screen union** | Navigation is a `setState`; Firestore listeners are the async state | Redux / Zustand / React Router — three screens need neither a state library nor a URL scheme |
| Persistence | **Firestore** (Spark free tier) | Two collections; the browser talks to it directly | An application server. There is nothing for one to do that Firestore is not already doing. |
| Offline | **Firestore persistent cache** (IndexedDB) | Cold start with no signal; queued writes | A hand-rolled sync layer |
| Hosting | **Firebase Hosting** | HTTPS, which camera and microphone require | — |
| CI/CD | **GitHub Actions** | lint → 327 tests → build → deploy, `main` only | — |
| Installable | **vite-plugin-pwa** (Workbox) | Home-screen install, offline shell | — |
| Android | **TWA APK via Gradle** in CI, on GitHub Releases | A wrapper around the hosted site — which is why the APK's version and the web app's version are legitimately different numbers | Firebase Hosting for the `.apk`; Spark refuses executables |
| AI proxy | **Cloudflare Worker** (free tier) | Holds the key the browser must not see; enforces an origin allowlist; routes to a provider | Putting the key in the frontend bundle. The repo is public. |
| Vision model | **Gemini 2.5 Flash → Pro retry**; OpenRouter behind the same contract | Handwritten slip → structured items | Fine-tuning; a self-hosted model |
| Speech | **Web Speech API**, in-browser | Transcript only — no audio is ever ours to handle | A server-side ASR model. Gemini is not in the voice path at all, so any "the voice model is broken" theory is wrong by construction. |
| Item matching | **Token-overlap scoring** (~70 lines, `matchLines.ts`) | Which of ~20 lines in *this* quote he meant | Fuse.js, embeddings, a vector DB. At two dozen strings already in memory, vector search is slower, costlier, and adds a service to run. |
| PDF | **jspdf + html2canvas**, lazy-loaded | Rasterised A4, so Telugu and the logo reproduce exactly | Text-based PDF — jsPDF's built-in fonts cannot render Telugu script |
| Tests | **Vitest**, two projects (`node`, `jsdom`) + Testing Library | Pure functions and the Worker in node; components in jsdom | Playwright/Cypress in CI — and see §7, that gap is real and named |
| Lint | **eslint** (flat config), enforced in CI | Covers `src/`, `config/`, `scripts/` | — |

---

## 7. Test topology — and the honest edges

```
npm test  →  327 tests, 21 files, two Vitest projects
│
├── project "unit"   environment: node    286 tests / 16 files
│   │   glob **/*.test.{js,ts}
│   ├── the Worker as a plain fetch(Request) → Response handler
│   │   (jsdom would serve these no better, and would quietly change what
│   │    they exercise — hence two projects, not one flipped flag)
│   └── every pure module: engine, types, voiceParse, numberWords,
│       matchLines, mergePages, movePage, format, sharePdf, logger,
│       export, readImage, firestoreAck, schema
│
└── project "dom"    environment: jsdom    41 tests / 5 files
        glob src/**/*.dom.test.tsx, setup src/test-setup.ts
    ├── ImageReader.dom     sequential-not-parallel reads (measured with an
    │                       in-flight counter, not merely asserted), partial
    │                       page failure, retry keeping hand edits, reorder,
    │                       the long-read gate
    ├── VoiceReader.dom     language persistence, add / alternatives / gating,
    │                       the change-a-line flow, mic refusal
    ├── CustomerScreen.dom  the copy sheet: prefill, recomputed total, re-minted
    │                       ids, cancel writes nothing, the customer picker
    ├── QuoteEditor.dom     no-cost warning, undo bar, compounding discounts
    └── smoke.dom           one test proving the project itself is wired up
```

**What green does not mean.** jsdom is not a browser: no layout engine, no
paint, no service worker, and **no Web Speech API at all**. Every component
test also fakes the network — `readImageItems`, `saveQuote`,
`updateCustomerDoc` and `db` are all mocked. So these remain unverified by the
suite, by design rather than by oversight:

- **390px layout** for the copy sheet, the ▲▼ controls, the long-read gate.
- **Anyone actually speaking into a microphone** against the current code.
- The **Android share sheet** — headless Chrome resolves `navigator.share`
  without showing anything.
- **Airplane-mode cold start**, which needs a live service worker.

A second layer outside CI closes some of that deliberately, since it costs
money or needs a real browser: `openrouter-live-check.ts` (real Worker, real
model, real slips — it found the two defects §5 describes), `pdf-check.ts`
(real Chrome, inspects the *file*), `cascade-check.ts` (real Firestore). Repeat
commands are in [`DESIGN.md §14`](DESIGN.md#14-runbook).

---

## 8. The three input paths, side by side

Every automated path ends the same way: **a confirm step**. Nothing a model
produced is ever written to a quote without Dad seeing it first.

```
① BY HAND
   QuoteEditor → Add Item → bottom-sheet editor → UILine (strings)
                                                    └→ lineInput.ts → engine

② BY PHOTOGRAPH
   ImageReader
     ├─ pick/shoot N pages ──► ▲▼ reorder ──► [N ≥ 6? confirm the wait first]
     ├─ FOR EACH page, SEQUENTIALLY:
     │     readImage.ts   downscale to 1600px / q85   (6155 KB → 646 KB)
     │        └─► POST Worker ─► origin check ─► pickProvider ─► model
     │                                              └─ schema-constrained JSON
     │                                              └─ normalize + confidenceOf
     ├─ mergePages()  page order, p2 badges, failed-page list
     ├─ CONFIRM LIST — editable, checkbox per row, retry a failed page alone
     └─ onAdd → QuoteEditor → lastImport snapshot → Undo bar

③ BY VOICE
   VoiceReader
     ├─ getUserMedia warm-up ─► wait for audiostart ─► "Speak now"
     ├─ Web Speech API (en-IN | te-IN) → transcript string   [device-side]
     ├─ parseIntent(transcript)
     │    ├─ "add"  → parseTranscript() → tokenize → classify → assemble
     │    └─ "set"  → matchLines() → isAmbiguous? → ASK which line
     └─ CONFIRM → QuoteEditor → lastImport snapshot → Undo bar
```

The asymmetry is intentional. The photo path is **sequential** and refuses to
batch, because a long list already sits against one 8192-token ceiling. The
voice path **asks rather than guesses** when two lines score within 0.15,
because silently editing the wrong line is indistinguishable from the app
working.

---

## 9. What a save actually does

Worth tracing once, because three separate bugs lived in this path.

```
QuoteEditor: Save
│
├─ lines: UILine[]  →  lineInput.ts  →  LineInput[]  →  calcQuote()
│                                                        └─ per-line rounding
│                                                           BEFORE summing
│                                                           (correctness, not
│                                                            cosmetics)
├─ totalSale denormalised onto the document, for list rows and home tiles
│
├─ existing quote?  updateDoc(...)     new?  doc(collection(...)) then setDoc
│                                             └─ id minted ON THE DEVICE, so a
│                                                new quote gets a stable id with
│                                                no signal. addDoc would have
│                                                had to wait for the server.
│
├─ ackOrQueued(write)  ── races a 2.5s timeout
│     ├─ server acked   → "Saved"
│     └─ timed out      → "Saved — will sync", button releases
│           (the write is NOT lost; Firestore drains it when signal returns)
│
├─ log.info("firestore", "quote saved", { id, queued, lineCount, totalSale })
└─ lastImport snapshot cleared — the Undo bar's contract ends at a real save
```

Two traps recorded here so they are not rediscovered:

- **`saveQuote` cannot write a quote for another customer, and fails *silently*
  if handed one.** It takes `customerName` as an argument but reads
  `customerId` from `useQuotes(customerId)`'s closure — so a cross-customer
  copy would have stored the right name against the wrong owner. That is why
  `copyQuoteTo(target, …)` exists, takes the target explicitly, and has **no
  `existingId` parameter at all**: the source quote is structurally unreachable
  from the copy path, not merely un-passed.
- **`createdAt` is minted when the editor opens**, not at save. The quote number
  on the customer document is derived from it (`Q-260806-1423`), so a PDF shared
  *before* the first save carries the same number the saved quote ends up with.

---

## 10. What is still open

Everything below is deliberate, not forgotten. Full detail in
[`CLAUDE.md`](CLAUDE.md) and [`HUMAN-TASKS.md`](HUMAN-TASKS.md).

```
Blocked on a person, not on code
├── PI-4.1  Firebase auth — LAST task in the plan, on purpose. Rules are
│           currently `allow read, write: if true`. Committing
│           `if request.auth != null` before a working sign-in UI exists would
│           lock Dad out of every quote the moment that deploy landed.
├── PI-3.2  Few-shot prompt examples — needs photographs of Dad's real slips
├──         Deploy the Worker: the LIVE one is stale. Proved twice — a
│           no-Origin request got 200 (the committed allowlist returns 403),
│           and `confidence` came back as the old constant. So the origin
│           allowlist is not yet protecting the key in production.
└──         Dad's actual phone: share sheet, airplane-mode cold start,
            camera/mic permissions, and someone speaking into the microphone

Open by choice — do not build until asked
├── Delete a customer.  deleteCustomerAndQuotes() exists and is proved against
│   real Firestore, but has NO caller: there is no delete button, deliberately.
│   A destructive control on a big-touch-target phone UI is the easiest way to
│   lose real data. If he asks: type-the-name confirmation, and say in the
│   dialog how many quotes go with it.
├── Bug #9. Pre-PI-2 quotes with fractional quantities can show a stale
│   `totalSale` in list rows and home tiles. Self-healing — opening and saving
│   the quote overwrites it — and only ever in the direction of correctness.
├── PDF upload for slips. He photographs paper; pdf.js is a real dependency
│   for a speculative input.
└── Natural-language questions over quote history. If it ever happens, the
    answer is NOT RAG — a year of quotes fits in a single prompt.

Known latent defect, left alone knowingly
└── providers/gemini.js sends no `thinkingConfig`. Reasoning tokens share the
    `max_tokens` budget; unbounded, they ate a whole reply on the OpenRouter
    path and returned empty after 70s. Gemini has the same shape of defect and
    was NOT changed, because there is no Gemini key on this machine to verify a
    fix against, and an unverified change to the default provider is worse than
    a documented risk.
```

---

## 11. The one-paragraph version

A React 19 PWA talks directly to managed Firestore with an offline IndexedDB
cache, so a phone with no signal still lists quotes and queues writes. The
domain is modelled around one fact — every line item carries two independent
price structures, cost and sell, each either a compounding discount chain off a
list price or a direct rate — and the pure `calc/engine.ts` is the only thing
allowed to do that arithmetic, logging and re-throwing rather than degrading,
because a silently wrong total is the one unacceptable outcome. Cost cannot
reach the customer document because the customer document's type has no cost
field. Items get in three ways: typed, photographed (multi-page, read
sequentially through a Cloudflare Worker that holds the model key and refuses
any origin but the app), or spoken (in-browser Web Speech, then a tokenizer
that knows English and Telugu number words and asks when it is unsure). Every
automated path ends at a confirm step and can be undone in one tap. There is no
application server, nothing runs outside a free tier, and the whole thing is
sized for exactly two users — which is why the interesting decisions in this
document are mostly about what was left out.
