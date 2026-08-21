# Quotation App — CLAUDE.md

## What this app is

A quotation app for Dad (electrical materials supplier / middleman). He takes orders, buys from vendors, supplies to customers. Profit = gap between vendor discount and customer rate. GST is pass-through and never enters profit.

Built by Siva for his dad. Non-technical end user — mobile-first, big touch targets, Telugu-friendly.

---

## Scope & posture — READ THIS BEFORE PROPOSING WORK

**This is a local app with about two users.** Siva and his dad. It is not a
product, not multi-tenant, and has no growth curve to plan for.

Standing instruction from Siva: do not engineer for scale or hostile traffic.
Weight every recommendation by *value to one man using this on his phone in the
field*. Prefer the fewest moving parts that work reliably.

The real failure modes are **Dad losing a quote** or **Dad reading a wrong
number** — not attackers, not traffic spikes, not query cost. Security and scale
items belong in the backlog as hygiene, never as blockers.

Corollary: say plainly when a technology is the wrong size for the problem
rather than listing it as an option. Worked example — item search should be
fuzzy string matching over a plain array (Fuse.js), **not** embeddings and a
vector DB. At a few hundred item names, vector search is slower, costlier, and
adds a service to run.

---

## Current working state — check this before assuming

*Last updated 2026-08-19. Re-check with `git status` and `git log -1`; if this
section disagrees with git, git is right and this section is stale.*

- **Branch:** `feature/Vision_Draft`, not `main`. Branched off `a159e6a`.
- **Deploys only happen from `main`** (`deploy.yml` triggers on push to main).
  Nothing on this branch is live. PI work has to reach `main` to ship.
- **~~Push is blocked by a 403.~~ FIXED — push works, first proved 2026-08-19.**
  `git push origin feature/Vision_Draft` succeeded (`7ae2fc4..ad18ece`), so the
  authorization gap this section described from 2026-08-10 is closed; someone
  accepted the invitation or fixed the token. **Push when asked** — do not
  re-report the 403, and do not tell Siva to push by hand.
- **Push to `feature/Vision_Draft`, never to `main`** — Siva's instruction on
  2026-08-10, and it now actually matters because pushing works. Verified safe
  and re-confirmed 2026-08-19: `deploy.yml` triggers only on
  `push: branches: [main]` and `build-apk.yml` is `workflow_dispatch`, so
  pushing this branch runs no workflow and deploys nothing. `origin/main` is
  still at `a159e6a`. **A push to `main` deploys to Dad immediately** — that is
  a release decision and needs Siva to say so.
- **Commit author must be `revan.datta132@gmail.com`.** With no `user.email`
  configured, git derives `revan.parimi@ibm.com` from the machine hostname,
  which is wrong. Global config is now set; verify with
  `git log -1 --format='%ae'` after committing.
- **`npm install` has not been run** in some checkouts — `node_modules` is
  absent and `npm test` fails with "'vitest' is not recognized" until it is.

---

## Live URLs

- **App:** https://quoteapp-3f48e.web.app
- **GitHub:** https://github.com/sivasanka1996/quoteapp (public repo)
- **Firebase project:** quoteapp-3f48e
- **Image proxy:** https://quoteapp-image-reader.qouteappsub.workers.dev (live)
- **APK:** GitHub Releases — check the repo Releases page for the current tag

> **Version drift — resolved 2026-08-07 (PI-4.6), and it was never a conflict.**
> Checked against the Releases API: the latest release is **v1.4**, and
> `APK_URL` already pointed at it. Two different things were sharing one
> unlabelled number. The APK is only a TWA wrapper around the hosted site, so
> `APP_VERSION` (**v1.5**, the web app, redeployed on every push to main) and
> `APK_VERSION` (**v1.4**, the newest release with an APK attached) are both
> right. Dad on the v1.4 APK sees the v1.5 web app.
>
> `APK_URL` is now built from `APK_VERSION`, so the tag and the link cannot
> disagree. `build-apk.yml` is staged to build the *next* one — `versionName
> '1.5'` / `versionCode 6`. After publishing a release: set `APK_VERSION` to
> the tag you just published, then bump `build-apk.yml` to the one after it.

---

## Stack

- **Frontend:** React + Vite + TypeScript
- **Storage:** Firebase Firestore (quotes + customers sync across devices)
- **Hosting:** Firebase Hosting (HTTPS, required for camera/mic)
- **CI/CD:** GitHub Actions → auto-deploys to Firebase on every push to `main`
- **PWA:** vite-plugin-pwa, installable on Android/iOS home screen
- **Android APK:** Built via GitHub Actions (Build Android APK workflow) using Gradle + TWA

---

## Running locally

```bash
npm install        # REQUIRED FIRST — node_modules is not committed and is
                   # often absent on a fresh clone. Without it `npm test`
                   # fails with "'vitest' is not recognized".
npm run dev        # http://localhost:5173 — talks to the REAL Firestore
npm run dev:local  # http://localhost:5173 — talks to the LOCAL emulator instead
npm run emulators  # start the emulator suite first, in another terminal
npm test           # 327 tests (Vitest, two projects — see below) — 39
                   # image-reader worker, 34 types, 31 engine, 30 voiceParse,
                   # 22 logger, 19 openrouter, 17 numberWords, 15 format,
                   # 14 readImage, 13 CustomerScreen.dom, 13 matchLines,
                   # 12 ImageReader.dom, 12 log export, 11 VoiceReader.dom,
                   # 10 sharePdf (page-break maths, filename), 9 mergePages,
                   # 8 movePage,
                   # 7 schema prompt (the rate rule, pinned by its defect),
                   # 6 firestoreAck, 4 QuoteEditor.dom, 1 smoke (dom project
                   # wiring)
npm run lint       # eslint — clean, keep it that way (now enforced in CI)
npm run build      # production build — AND the typecheck for src/ AND scripts/
npm run sanity     # repo hygiene — strays, dead code, doc drift. Read-only.
```

**These counts drift, so do not hand-maintain them.** `npm run sanity` compares
the number claimed here against the suite and says so when they disagree; it
caught this block still reading 323 after `CustomerScreen.dom` went 9 → 13 with
the cross-customer copy picker.

### `npm run dev` uses the real Firestore; `dev:local` uses an emulator

`src/firebase.ts` points at the live `quoteapp-3f48e` project, so a plain
`npm run dev` reads and writes the real database.

**This is a convenience, not a safety gate — Siva's call, 2026-08-12.** Dad
manages his own data; testing with throwaway `ZZ-` records against the live
project is fine and needs no ceremony. The emulator is here because a clean,
empty database is *pleasant* to test against, not because production must be
protected from us. If Java is not installed, use `npm run dev` and move on.

Two terminals, when you want the clean one:

```bash
npm run emulators   # local Firestore on :8080, Auth on :9099, UI on :4000
npm run dev:local   # the app, pointed at them
```

The switch is Vite's own `--mode` (`vite --mode emulator`), so it needs no extra
dependency and behaves identically in PowerShell, where `VITE_FOO=1 vite` does
not work. **`deploy.yml` runs plain `npm run build`**, whose mode is
`production`, so a deploy cannot point at localhost — verified by grepping the
production bundle: `connectFirestoreEmulator`, `127.0.0.1` and the warning
banner are all **absent**, tree-shaken by the constant fold. Only the inert port
number survives, in the config object, read by nothing.

Against the emulator the Firestore cache is deliberately **memory-only**. A
persisted cache would outlive `emulators:start`, so yesterday's test data would
reappear against an empty database and look exactly like a bug.

**One prerequisite:** the Firestore emulator is a Java program, and `java` is
**not installed on this machine** (checked 2026-08-12). Any JRE 11+ works.
Without it `npm run emulators` fails and `npm run dev` is the fallback — which
is fine, per the note above.

**What actually needs a human is in [`TESTING.md`](TESTING.md):** photos of
handwritten slips, and fifteen minutes speaking into a microphone. Everything
else about feature testing the agent can do alone.

**`npx tsc --noEmit` checks nothing here — do not trust it.** The root
`tsconfig.json` is a solution file holding only `references`, so that command
exits 0 having typechecked zero files. It reported clean on a file that
`npm run build` then rejected (2026-08-10). **`npm run build` is the typecheck**
— it runs `tsc -b`, which follows the references to `tsconfig.app.json`,
`tsconfig.node.json` and `tsconfig.scripts.json`. Corollary: test files are
compiled with the *app* config, which has no Node types, so `process` in a test
needs reaching through `globalThis`.

**`tsconfig.scripts.json` was added 2026-08-19, because `scripts/` had been
typechecked by nothing at all.** The app config includes only `src` and the node
config only `vite.config.ts`, so a deliberate type error planted in
`cascade-check.ts` passed `npm run build` clean — a script that **deletes
documents from the real Firestore**. Proved red-then-green: the same planted
error now fails the build, and the build is clean once reverted. One file is
excluded on purpose — `scripts/pdf-check.ts` imports `playwright-core`, which is
deliberately not a dependency; the reason is written in the tsconfig, and
`npm run sanity` keeps reporting the exclusion so it cannot quietly spread.

**`vite.config.ts` defines two Vitest *projects*, not one environment — do not
switch the suite's environment wholesale.** `unit` (`environment: 'node'`,
glob `**/*.test.{js,ts}`) covers pure functions and the Cloudflare Worker.
`dom` (`environment: 'jsdom'`, glob `src/**/*.dom.test.tsx`, setup
`src/test-setup.ts`) covers React components — `ImageReader.dom.test.tsx`,
`VoiceReader.dom.test.tsx`, `CustomerScreen.dom.test.tsx`,
`QuoteEditor.dom.test.tsx`, plus the one-test `smoke.dom.test.tsx` that proves
the project itself is wired up. A new component test goes in a
`*.dom.test.tsx` file under `src/` — that alone is enough to pick it up, no
config change needed. **Flipping `environment` on the `unit` project to
`jsdom`** — the old fix for "no component tests" — **would take the Cloudflare
Worker tests with it**: `cf-worker/image-reader.js` is a plain
`fetch(Request) → Response` handler, and jsdom would not serve that any better
than node does while quietly changing what those 39 tests exercise. The
two-project split exists specifically so the next agent does not have to make
that trade-off by hand.

The Worker's tests run with `globalThis.fetch` stubbed and never touch the
real Gemini API.

**This is a Node/TypeScript project.** `package.json` is the only manifest.
There is no Python code and no `requirements.txt` is needed. If a `.quoteapp/`
virtualenv directory appears, it is a stray — delete it.

---

## Deploy

Push to `main` → GitHub Actions runs tests → builds → deploys to Firebase automatically.

**The Cloudflare Worker does not ship this way, and that matters.** `cf-worker/`
is deployed by hand with `npx wrangler deploy`, against one live URL that every
build of the app already points at. So a worker change goes live for Dad the
moment it is deployed — it does not wait for `main`, and it is not held back by
being on a feature branch. Worker code committed on a branch is *not* live;
worker code deployed from a branch *is*. Keep those two facts apart.

Secrets required in GitHub repo settings:
- `FIREBASE_TOKEN` — from `firebase login:ci`

Manual APK build: Actions → **Build Android APK** → Run workflow → download artifact → attach to GitHub Release.

**Note:** Firebase Spark plan blocks executable files — APK cannot be hosted on Firebase Hosting. It is hosted on GitHub Releases instead. The home screen banner links directly to the release asset.

---

## Architecture

> **The diagrammed, end-to-end version is [`DESIGN.md`](DESIGN.md)** — system
> topology, data model, the calc engine, the three input paths, the offline
> design, deploy topology, test coverage gaps, a swept inventory of leftover
> design, and the runbook with launch and connectivity commands.
>
> Division of labour between the docs: **this file** is the plan, the decisions,
> and the current state. **`DESIGN.md`** is the shape of the system and why it is
> that shape — topology, data model, the annotated repo map (§15), how it got
> here (§16), and the runbook. It is the **only** architecture document; a second
> one was started on 2026-08-20 and merged straight back in, because the two
> immediately began restating each other. Add a section there rather than a new
> file. **`HUMAN-TASKS.md`** is what only a person can clear. **`docs/history/`** is the
> evidence behind every "DONE" claim here — the verification tables, moved out on
> 2026-08-19 so this file stays cheap to load every session. When a design
> decision changes, change it in `DESIGN.md` in the same commit as the code.
>
> **The rule for the split: a *rule* lives here, a *receipt* lives in
> `docs/history/`.** If a sentence tells the next agent what to do or not do, it
> belongs in this file even if it came out of a verification run. If it records
> what was checked and what the result was, it belongs in history.
>
> One thing `DESIGN.md` says loudly because it keeps being assumed otherwise:
> **there is no application server, no FastAPI and no uvicorn.** Firestore is
> managed and the browser talks to it directly; the only locally runnable process
> is the image-reader Worker.

### Screen flow
```
HomeScreen (search/add customers)
  → CustomerScreen (customer's quote history)
    → QuoteEditor (edit quote, save to Firestore)
      → CustomerView (customer-facing PDF, print)
```

### Key files

**The annotated file-by-file map is [`DESIGN.md` §15](DESIGN.md#15-repo-map--every-file-and-what-it-is-for).**
It used to be duplicated here in full — 215 lines — and the two copies had
already drifted (this one still said `CustomerScreen.dom` had 9 tests when the
command block above said 13). One map, in the architecture doc.

What stays here is only what a change to those files must **obey**:

- **[`config/app.config.ts`](config/app.config.ts) is where settings change** —
  not `wrangler.toml`, not `.env`. API keys cannot live there (public repo); it
  names each secret and the command to set it. **Precedence is env var > file**,
  which is what keeps a provider rollback a dashboard edit rather than a deploy.
- **Any new write that drives a button must go through
  [`firestoreAck.ts`](src/firestoreAck.ts)**, or it hangs forever offline.
  Corollary: **never `await updateCustomerDoc` to drive a button.**
- **`deleteCustomerAndQuotes` has no caller outside `scripts/`, deliberately** —
  there is no delete button. See KNOWN GAPS before "fixing" that.
- **`duplicateQuote` omits `totalSale` on purpose** so the caller recomputes it;
  the stored value can be stale (bug #9). Read its doc comment before changing.
- **`log/logger.ts` may never throw** — it is called from inside catch blocks.
  Read the file header before touching it.
- **`calc/engine.ts` logs and re-throws.** Never a fallback return.
- **`voiceParse` quantities are whole numbers only**, deliberately — spec §3.4.
- **`numberWords` consults English *and* Telugu tables always**; the recogniser
  does not respect the language toggle for numbers.
- **`matchLines` is plain token-overlap scoring — not Fuse.js, not embeddings.**
  It matches a couple of dozen strings inside one quote.
- **`movePage` returns the list untouched on an out-of-range move** rather than
  losing one of Dad's photos.
- **`test-setup.ts` calls `cleanup()` after every `dom` test.** Testing Library
  does not unmount on its own with globals off, and a leftover tree makes the
  next test's queries match two elements.
- **Nothing in `scripts/` is a `*.test.ts`, on purpose** — CI must never run
  them. `openrouter-live-check.ts` **spends money**; `cascade-check.ts` writes
  to the **real** Firestore; `pdf-check.ts` needs
  `npm install --no-save playwright-core` and is the one file excluded from the
  typecheck; `repo-sanity.mjs` is housekeeping and must never block a deploy
  that ships correct maths.
- **The provider contract never throws** — a failure is `items: []` with
  `detail` set. That is what lets the Worker's router carry no try/catch.

(The pre-Firestore `QuoteDrawer.tsx/css` and `useQuoteStorage.ts` were deleted
in PI-4.3 — 286 lines imported by nothing but each other. Git has them.)

### Design system

All color, spacing, type, radii and shadow values live as CSS custom properties in
`src/index.css`. Screens consume tokens — do not hardcode hex values or px spacing.
Money uses `.tnum` (tabular numerals) so digit columns align. Touch targets are
`var(--tap)` = 48px minimum.

### Firestore collections
```
customers/{id}
  name: string
  phone: string
  address: string
  createdAt: timestamp

quotes/{id}
  customerId: string
  customerName: string (denormalized)
  name: string
  lines: UILine[]
  totalSale: number (denormalized for list display)
  status: "draft" | "sent" | "accepted" | "declined"
  createdAt: number
  updatedAt: number
```

`status` is set by hand in the quote editor — nothing infers it. Quotes written
before the field existed read as `undefined`; use `quoteStatus(q)` from
`types.ts`, which falls back to `"draft"`.

---

## Calc engine — the heart of the app

**Discount mode:** `list × (1 − d1) × (1 − d2) × …` (compounding, NOT additive)
- e.g. `17835 × (1−0.647) × (1−0.02) = 6169.84`

**Direct rate mode:** rate entered directly

**Per-line math:**
```
lineCostTotal = round(resolvedCost × qty)
lineSaleTotal = round(resolvedSell × qty)
lineProfit    = lineSaleTotal − lineCostTotal
gstAmount     = round(lineSaleTotal × gstPct/100)
```

**Totals:** sum already-rounded line values (per-line rounding is a correctness requirement, not cosmetic)

**Profit:** pre-GST gap between sell and cost. GST is pass-through and never enters profit.

---

## UILine shape (shared type in types.ts)

```typescript
interface UILine {
  id: number;
  name: string; qty: string;
  costMode: "discount" | "direct";
  costList: string; costDisc1: string; costDisc2: string; costRate: string;
  sellMode: "discount" | "direct";
  sellList: string; sellDisc1: string; sellDisc2: string; sellRate: string;
  gstPct: string;
}
```

Discount fields are plain numbers (e.g. `"64.7"`, `"2"`). The engine builds `"64.7% + 2%"` internally.

---

## Key decisions (locked)

- No inventory, no product catalog, no price memory, no AI chat
- GST default 18%, editable per line, pass-through only
- Discounts compound (never additive)
- Blanket discount panel: apply same discount to all or selected lines
- Customer PDF hides cost/profit — shows only sell side with optional discount %
- Company header (name, address, phone, GSTIN, logo) on customer PDF
- Column toggles on customer PDF (show/hide Qty, List price, Discount, Rate, Amount)
- Everything is free — Spark plan Firebase, no Blaze
- APK hosted on GitHub Releases (not Firebase — Spark blocks executables)
- **AI stays as-is:** Gemini 2.5 Flash for image reading, browser Web Speech API
  for voice. No new models, no embeddings, no vector DB, no RAG. Improve the
  prompt layer instead — see PI-3.
- Cost/profit can never reach the customer view. This is enforced by the type
  system, not CSS: `CustomerView` takes `CustomerLine[]`, which has no cost
  field at all. Keep it that way.
- **Voice recording is tap-on / tap-off, and `continuous` stays `true`.**
  Siva's call, 2026-08-13, after using it. With `continuous = false` the speech
  service's own endpointer decides when you have finished: it finalises at the
  first pause it judges long enough, and that judgement moves with background
  noise and how complete the sentence sounds. **The Web Speech API exposes no
  threshold to tune** — there is no `speechTimeout` in the standard — so the
  only alternatives were Google deciding or Dad deciding. Dad decides. He can
  pause to find the next line on the slip without losing the recording, and end
  it the instant he is done. A silence no longer counts as a failure either:
  `no-speech` while still listening restarts the microphone (capped at 5)
  instead of throwing the session away. **Do not "simplify" this back to
  single-utterance mode** — it cut lines off mid-sentence, which is precisely
  the complaint that led here. The rejected middle option was a fixed silence
  timer of our own; it was turned down because it makes every short line wait.

---

## Firestore rules

Currently open (test mode):
```
allow read, write: if true;
```
File: `firestore.rules` — deployed automatically with `firebase deploy`.

The Firebase config is committed and the repo is public, so anyone who reads it
can reach the collections. For a two-user local app this is a **nuisance risk,
not a breach risk** — it sits in PI-4 as hygiene, not as a blocker. A single
shared Google sign-in plus `if request.auth != null` closes it in an afternoon.

**Stale index — removed from the file 2026-08-07 (PI-4.5).** It declared
`customerId + updatedAt` while `useQuotes` had dropped the `orderBy` back in
1ef97d9 and sorts client-side, leaving a single equality filter that needs no
composite index. Note the index may **still exist in the Firebase console** —
`firebase deploy` does not delete indexes it no longer sees. An unused index
costs a little storage and nothing else; delete it there when convenient.

---

## Current build status — WHAT IS DONE

- [x] **PI-1 Trust** — Firestore persistent cache (IndexedDB, offline reads +
      queued writes); `seedNextId` closes the duplicate-line-id bug; save has
      try/catch, a retry banner and an ack timeout so it can never hang;
      unsaved-changes dialog on back plus a `beforeunload` guard; app-wide
      `ErrorBoundary`; "no cost" chip, cost-side ₹0 warning and a profit-panel
      caveat on imported lines. Verified end-to-end in a real browser — see the
      PI-1 table for what was and was not checked.
- [x] **PI-2 The document** — the customer view is a quotation now, not a price
      list. It carries a To block (name, address and phone, read from the
      customer record), a quote number derived from `createdAt`
      (`Q-260806-1423`), the date, an optional subject taken from the quote
      name, validity and terms from company settings, and `₹` on every amount.
      Every field hides when it is empty, so a customer with no address on file
      still prints cleanly. The editor mints `createdAt` when it opens, so a PDF
      shared *before* the first save carries the same number the saved quote
      ends up with. Fractional quantities fixed (bug #5). Verified end to end in
      Chromium against the real Firestore — 33 checks, all passing; see the PI-2
      table below.
- [x] **PI-3 Sharpen the AI paths** — five of the seven items. The worker now
      asks Gemini for schema-constrained JSON instead of regex-hunting a
      ```json fence out of prose; it retries once on Gemini 2.5 Pro when Flash
      returns nothing usable; and `confidence` is derived from the items that
      actually came back rather than being the constant `"partial"`. The client
      downscales photos to 1600px on the long edge before upload (a 6 MB photo
      became a 646 KB POST, measured in Chromium) and refuses with an honest
      "no internet connection" message instead of a generic failure. Item 2
      (few-shot examples) is **not done** — it needs real order slips from Dad;
      item 6 (keep Web Speech API) needed no work. See the PI-3 table below,
      and read the "not deployed" note before assuming any of this is live.
- [x] **PI-4 Hygiene — 7 of 8 DONE 2026-08-07.** Dead code gone (286 lines);
      the composite index nothing queries dropped; `npm run lint` enforced in
      CI; a customer's quotes now deleted with them in one `writeBatch` (bug
      #6), proved red-then-green against the real Firestore by
      `scripts/cascade-check.ts`; the worker refuses any origin that is not the
      app, and refuses a missing origin too, so it is no longer a free Gemini
      relay; the version "drift" turned out to be two things sharing one
      unlabelled number and is now labelled; the keystore password reads from a
      secret instead of sitting in plaintext in a public repo. **Only PI-4.1
      (auth) is left, and it is blocked on console access — see below.** The
      worker half is committed but **not deployed**.
- [x] **Customer editing — DONE and VERIFIED 2026-08-08.** A pencil button on
      the customer screen opens a sheet over the name, phone and address. It
      exists because PI-2 put all three on the To block of every quotation while
      leaving them uneditable, so a wrong phone number was reaching customers
      with no way to correct it. Because
      [QuoteEditor.tsx:281-283](src/QuoteEditor.tsx#L281-L283) passes the live
      `customer` object to `CustomerView` rather than the quote's denormalized
      `customerName`, **a correction fixes quotations already saved** — that is
      the whole value, and it is checked below. Deleting a customer is still
      deliberately absent; see KNOWN GAPS. Verified with 21 checks in Chromium
      against the built app and the real Firestore, plus 8 new unit tests.
- [x] **PI-5 Observability — DONE 2026-08-10.** `src/log/` gives the app an eye:
      four levels, `debug` behind a flag Siva can turn on over the phone
      (`?debug=1` or the settings toggle), a 2000-record / ~1 MB ring buffer
      persisted to IndexedDB so it survives the reload a crash forces, and
      **Export problems / Export everything** in settings writing timestamped
      `.log` files. `try`/`catch` now covers the hooks, the readers, the PDF
      path and the engine, on the layered ladder spec §2.4 defines. The Worker
      writes one structured JSON line per request. **41 new unit tests.**
      See the PI-5 table below for what was verified how — two items are
      manual-only and are marked as such.
- [x] **PI-6 Parsing — DONE 2026-08-10.** `voiceParse` is a tokenizer now
      (tokenize → classify → assemble), not three regexes asking three
      questions. The three defects the audit named are fixed and pinned by
      tests: `"six wire rate 1650"` reads qty **6** (was 1), `"wire 6 nos rate
      1650"` reads qty **6** (was 1), and `"2 wire code 4402"` reads rate
      **null** (was 4402 — an item code priced as money). Number words now
      cover English *and* Telugu 1–100 in `src/parse/numberWords.ts`; English
      had none at all before, which is the likeliest root cause of what Siva
      reported. `engine.ts` no longer round-trips money through
      `"64.7% + 2%"`. **31 new unit tests, and all 9 original voiceParse tests
      plus all 23 original engine tests still pass unchanged.**
- [x] **PI-7 Pluggable AI provider — DONE 2026-08-10, NOT DEPLOYED.**
      `cf-worker/` is now a router plus interchangeable providers behind a
      one-function contract that **never throws**. Gemini's Flash → Pro path
      moved out unchanged — a pure move, proved by all 25 original worker tests
      passing with **zero edits to their assertions**. OpenRouter sits beside
      it, and `AI_PROVIDER` chooses. **Gemini stays the default**, so nothing
      changes for Dad. 24 new worker tests (55 total). The point of the whole
      abstraction: **rollback is an env var, not a deploy.**
- [x] **PI-8 Multi-page slips — DONE and VERIFIED 2026-08-10.** Dad can pick or
      photograph every page of a long order list. Pages read **sequentially,
      one call each** — never batched (spec §5.2) — with "Reading page 2 of 3…"
      while it works, and merge into one confirm list with a `p2` badge on each
      row. A page that fails does **not** lose the others: it gets an inline
      "Page 2 could not be read — retry" row, and retrying re-reads only that
      page while keeping edits already made to the rows that worked. 9 new unit
      tests on the pure merge, plus **18 browser checks, all passing.**
- [x] **The real AI read — DONE 2026-08-12. Two production defects found and
      fixed.** All 57 worker tests stubbed `fetch`, so no request this repo
      builds had ever received a real 200. It has now:
      `scripts/openrouter-live-check.ts` drives the **real** worker — router,
      origin allowlist, `pickProvider`, provider and `normalize` all the
      shipping ones — against generated mock slips, on the live OpenRouter API.
      **30 checks, all passing**, after two genuine defects were fixed. The
      contract itself was sound: model id, `response_format` dialect, image part
      shape and base64 encoding were all correct first time. What was broken was
      subtler and worse. See the table below.
- [x] **Voice input actually works at a microphone — 2026-08-13.** The first
      time anyone spoke into it, short phrases vanished and long rambling ones
      worked, which looked random. It was not: `recognition.start()` returns
      instantly but `audiostart` did not fire for **3785ms**, and nothing is
      recorded until it does. The panel said "Listening… Speak now" during that
      whole dead window, so an order line — about two seconds — was over before
      Chrome began recording. Three separate theories (network, permission,
      `te-IN` support) were all wrong and were killed by a console trace of the
      raw Web Speech events; **the fix came from instrumenting, not reasoning.**
      Now: the mic is warmed with `getUserMedia` when the panel opens, a
      `starting` stage refuses to invite speech until `audiostart` fires,
      interim results show the words live, and a session that ends without a
      final result salvages what was already recognised. `continuous` is **on**,
      with the listening panel itself as the stop control — see the note under
      KEY DECISIONS. `src/VoiceReader.tsx` had no logging at all before this
      (PI-5 instrumented every path except the only one a machine cannot test);
      it now records warmed / opened / sound / speech / transcript / ended with
      timings, which is what `?debug=1` was built for.
- [x] **PI-9 Duplicate a quote — DONE and VERIFIED 2026-08-18.** A copy (⧉)
      button on every quote row in `CustomerScreen` opens a sheet prefilled
      `"<name> (copy)"`. Confirming recomputes the total from the copied lines
      instead of trusting the stored `totalSale` (which can be stale — bug
      #9), re-mints every line id from 1, and always saves as a new `draft`
      document — even copying an `accepted` quote — so a copy can never read
      as a second acceptance of the original. `duplicateQuote` (pure,
      `src/types.ts`) has 10 unit tests; the sheet itself has **9 jsdom
      component tests** (14 as of the picker below). **Cross-customer copy
      shipped 2026-08-19**, closing the spec's last open item: the sheet has a
      "Copy to" picker, and the write goes through `copyQuoteTo` rather than
      `saveQuote`. See the PI-9 table below.
- [x] **PI-10 Voice undo + edit — DONE 2026-08-18, never proven at a real
      microphone.** A one-step Undo bar reverts the most recent voice or image
      import (`lastImport` snapshot in `QuoteEditor.tsx`), cleared only on a
      successful save. `parseIntent` (`voiceParse.ts`) classifies a transcript
      as `add` (append, the old behaviour) or `set` (change an existing
      line's rate or qty), and `matchLines`/`isAmbiguous`
      (`parse/matchLines.ts`) score which line a spoken target means,
      prompting Dad to choose when two lines score within 0.15 of each other
      rather than guessing. 30 `voiceParse` + 13 `matchLines` unit tests, plus
      3 jsdom component tests driving the full change-a-line flow. **jsdom has
      no Web Speech API at all** — every test here fakes the recognizer, so
      nobody has actually spoken into a microphone against this code. See the
      PI-10 table below.
- [x] **PI-11 Finish the image path — DONE 2026-08-18, logic verified; 390px
      layout unverified (no browser anywhere in this plan).** Pages can be
      reordered with ▲▼ before reading (`movePage`, pure, 8 tests); a 6+ page
      read now confirms first ("N pages… about M seconds") instead of starting
      immediately (`appConfig.image.longReadPages`/`secondsPerPage`). Two
      defects found by the implementer reading the diff, not a browser, were
      fixed before review: the ▲▼ buttons visually collided with the page
      badge (moved to the free corner), and a side effect was firing inside a
      React state updater (hoisted out). See the PI-11 table below.
- [x] **PI-12 Browser checks into the repo — DONE 2026-08-18.** A second
      Vitest *project*, `dom` (jsdom), alongside the existing `unit` (node) —
      **36 new component tests** against the real components, only the
      network and the Web Speech API faked: `ImageReader.dom.test.tsx` (12),
      `VoiceReader.dom.test.tsx` (11), `CustomerScreen.dom.test.tsx` (9),
      `QuoteEditor.dom.test.tsx` (4), covering PI-9 through PI-11 above plus
      the pre-existing multi-page image path. Two genuine test defects were
      found and fixed along the way — a page-reorder test that could not fail,
      and a VoiceReader test that was factually wrong about what the
      component does — both traced by hand and confirmed by running the
      broken version first. **310 → 323 tests.** jsdom is not a browser: no
      layout engine, no service worker, no real microphone — see the PI-12
      table below for exactly what rests on jsdom versus what is still open.
- [x] Full visual redesign — design tokens, all four screens, mobile-first
- [x] Quote status (draft/sent/accepted/declined) — badges, filter, home stat tiles
- [x] Business / Customer view toggle in the quote editor
- [x] Collapsed item rows + bottom-sheet line editor (cost, sell, GST, profit)
- [x] Share as PDF / WhatsApp — Web Share API, falls back to file download
- [x] Voice input — en-IN default, English/తెలుగు toggle, Telugu-aware parser
- [x] Calc engine — 23 engine tests (104 across the whole suite)
- [x] Quote editor — card UI, blanket discount (apply to all / selected), profit summary
- [x] Discount inputs — plain number fields (Discount % + Extra disc %), no % symbol to type
- [x] Customer PDF — column toggles, company header (logo/name/address/GSTIN), print to PDF
- [x] Firebase Hosting + GitHub Actions auto-deploy on push to main
- [x] PWA — installable on phone (manifest, icons, service worker)
- [x] Customer management — home screen search/add, customer quote history, Firestore sync
- [x] Company settings — name, address, phone, GSTIN, logo upload, saved to localStorage
- [x] Save & persist — quotes saved to Firestore per customer, not localStorage
- [x] Android APK — built via GitHub Actions using Gradle/TWA, hosted on GitHub Releases
- [x] APK download banner on home screen — green banner linking to GitHub Release
- [x] Image reading — "📷 Read image" button in QuoteEditor; Cloudflare Worker proxy for Gemini; swappable module `src/readImage.ts`; Telugu + English; confirmation UI before adding items
- [x] Image reader ACTIVATED — worker is deployed, `VITE_IMAGE_PROXY_URL` is set in `deploy.yml`

---

## KNOWN BUGS

Audited 2026-08-05. Bugs 1, 2, 3, 4 and 7 were closed by PI-1; bugs 5 and 8 were
closed by PI-2 on 2026-08-06; bug 6 was closed by PI-4.4 on 2026-08-07 — see
**WHAT IS DONE**. This is what is left.

9. **A quote saved before PI-2 with a fractional-quantity line can show a stale
   `totalSale` in the quote list and the home tiles.** `totalSale` is
   denormalized at save time. Before bug #5 was fixed, a line with `qty:
   "2.5"` was costed at the truncated quantity (2) when it was saved, and that
   truncated `totalSale` is what got written to Firestore. The editor and the
   customer document always recompute from the stored `lines`, so both already
   read correctly. `CustomerScreen`'s list row and the home stat tiles read the
   stored `totalSale` field directly, so they keep showing the old, truncated
   figure until the quote is opened and saved again — which overwrites it with
   the correct total. Self-healing, and only in the direction of correctness;
   not worth a migration for a handful of pre-fix quotes.

(Numbering is kept from the original audit so older notes still line up. Only
#9 is open; the rest are closed bugs. #10 was found and closed the same day —
see **WHAT IS DONE**.)

---

## KNOWN GAPS — not bugs, but not what the notes imply

Found 2026-08-07 by reviewing the whole branch against `main` before merge:
`useCustomers` returned `updateCustomer` and `deleteCustomer` and
[HomeScreen.tsx:20](src/HomeScreen.tsx#L20) destructured
`{ customers, loading, addCustomer }` — neither of the other two had a call site
anywhere in `src/`. The edit half was built on 2026-08-08 (see **Customer
editing** under WHAT IS DONE). What remains:

**There is still no way to delete a customer, deliberately.**
`deleteCustomerAndQuotes` has no caller outside `scripts/cascade-check.ts`. So
bug #6's fix is real and proved against live Firestore, but it is a *library*
repair, not a user-facing one — PI-4.4's wording oversells it. Nothing
regressed; there was never a delete button. Do not tell Dad the delete
behaviour changed for him.

Left undone because nothing is asking for it: a customer costs nothing to leave
in the list, the search box handles a long list, and a destructive control on a
big-touch-target phone UI is the easiest way to lose real data. If Dad does ask,
the batch already exists and is already tested — put it behind a
type-the-name confirmation, and say in the dialog how many quotes go with it.

---

## WHAT TO BUILD NEXT — PI plan

Ordered by value to Dad. Do not jump ahead; PI-1 is what makes the app
trustworthy, and nothing else matters until it is done.

> **Anything needing a human — a console login, a repo permission, a photo, or
> Dad's actual phone — lives in [`HUMAN-TASKS.md`](HUMAN-TASKS.md).** That is the
> queue Siva works through with his colleague. Keep it in sync: when a task here
> turns out to be blocked on a person, move it there rather than leaving it
> looking actionable.
>
> **PI-4.1 (Firebase auth) is now the last task in the plan**, not the first item
> of PI-4 — see the PI-4 section.

### PI-1 → PI-4, and customer editing — DONE, verified 2026-08-05 → 08

All shipped and verified by driving the **built** app in Chromium (Playwright,
against the real Firestore), plus unit tests. **The evidence tables — every
check, how it was run, and what it deliberately did *not* cover — are in
[`docs/history/pi-1-to-4-verification.md`](docs/history/pi-1-to-4-verification.md).**

Read that file before re-verifying any of this or assuming a gap is still open.
It carries the harness recipes (none of the harnesses are in the repo), the two
defects the whole-branch review caught that no single task's review could see,
and the reasoning behind the save path's ack race.

Three things from it that are still live constraints, not history:

- **PI-3 item 2 (few-shot examples) is open and blocked on Siva**, not on code —
  it needs photos of Dad's actual order slips. See [`HUMAN-TASKS.md`](HUMAN-TASKS.md) §4.
- **PI-4.1 (Firebase auth) is the last task in the whole plan**, deliberately.
  Committing `if request.auth != null` before a working sign-in UI exists would
  lock Dad out of every quote the moment that deploy lands.
- **The customer PDF is pinned to 760px and must not be made responsive again**
  without re-reading the note there — a responsive document meant the file a
  customer received depended on the screen it was shared from.

### PI-5 → PI-8 — DONE 2026-08-10

**Spec:** [`docs/superpowers/specs/2026-08-10-observability-parsing-and-providers-design.md`](docs/superpowers/specs/2026-08-10-observability-parsing-and-providers-design.md)
**Plan:** [`docs/superpowers/plans/2026-08-10-pi-5-to-8-implementation.md`](docs/superpowers/plans/2026-08-10-pi-5-to-8-implementation.md)

*What each PI shipped is in **WHAT IS DONE** above; the evidence is in
[`docs/history/pi-5-to-8-verification.md`](docs/history/pi-5-to-8-verification.md).
Only what still binds is repeated here.*

**Two things proved live on 2026-08-10 that are still true:**

1. **The deployed worker is stale, proved twice over.** A no-Origin request got
   **200** (the committed allowlist returns 403), and `confidence` came back
   `"partial"` on a fully-populated read (PI-3.7 made it derived). So PI-3 and
   PI-4.2 are both still dead in production, and **the key is a free relay right
   now**. This is the single strongest argument for `wrangler deploy`.
2. **Voice has no backend model.** It is `window.SpeechRecognition` — the
   browser's Web Speech API. Gemini never sees audio and the Worker is not in
   the voice path. Any "the voice model is broken" theory is wrong by
   construction; the fault is recognition or `voiceParse`.

*(A third measurement — "Gemini 2.5 Flash reads a mock slip correctly" — was
superseded on 2026-08-12 by real handwriting through the whole pipeline. See
"The live API reads" below.)*

**Decisions locked with Siva on 2026-08-10:**

- Logs go to an **IndexedDB ring buffer exported on demand** as timestamped
  files. A browser cannot write to a folder — no filesystem API, no server, and
  Workers have no filesystem either. The File System Access API was rejected
  because it does not exist on Android Chrome, so it could never work for Dad.
- **Gemini stays the default provider.** OpenRouter goes in behind the same
  contract so a rollback is an env var, not a deploy. Opening candidate is
  `qwen/qwen3.7-flash` ($0.03/M in). Cost is irrelevant at Dad's volume —
  **Telugu accuracy decides it**, and that needs real slips.
- **`try`/`catch` everywhere — Siva's explicit call, made after the trade-off
  was put to him.** It is safe only because the *catch behaviour is layered*:
  `calc/engine.ts` logs and then **re-throws**, so a math failure surfaces as
  the ErrorBoundary card instead of a silently wrong total. Do not "simplify"
  that into a fallback return.
- **Multi-page reads are sequential, one call per page.** Batching shares one
  8192-token budget, and that ceiling is already the first suspect for an empty
  read on a long list.
- `format.ts` and `sharePdf.ts` regex **stay**. "No regex" is a rule about
  parsing *human* input, not about deterministic digit grouping.

Two more rules from the same work, not repeated elsewhere:

- **The logger never throws, and that is load-bearing** — it is called from
  inside catch blocks. Every entry point is wrapped and every sink guarded.
- **Bug #10's fix is the shared ack race in [`src/firestoreAck.ts`](src/firestoreAck.ts).**
  Any new write that drives a button must go through it.

### One config file — added 2026-08-11

Siva's call: "we need a file where it can be configured in a common place."
Settings had spread across four — `.env.local`, `wrangler.toml [vars]`,
`wrangler secret`, and constants inlined in source. Now
[`config/app.config.ts`](config/app.config.ts) holds all of it, and **both
halves import the same file**: Vite bundles it into the app, wrangler bundles it
into the Worker. There is one answer instead of two that drift.

| Was | Now |
|---|---|
| `MODELS` in `providers/gemini.js` | `ai.gemini.models` |
| `DEFAULT_MODEL` in `providers/openrouter.js` | `ai.openrouter.model` |
| `maxOutputTokens` / `temperature`, duplicated per provider | `ai.maxOutputTokens` / `ai.temperature` |
| `ALLOWED_ORIGINS` in `image-reader.js` | `worker.allowedOrigins` |
| `AI_PROVIDER` etc. in `wrangler.toml [vars]` | `ai.provider`, `worker.logLevel` |
| `VITE_IMAGE_PROXY_URL` in `.env.local` | `worker.url` |
| `MAX_EDGE` / `JPEG_QUALITY` in `readImage.ts` | `image.maxEdge` / `image.jpegQuality` |
| `MAX_RECORDS` / `MAX_BYTES` in `log/buffer.ts` | `log.maxRecords` / `log.maxBytes` |
| `ACK_TIMEOUT_MS` in `firestoreAck.ts` | `firestore.ackTimeoutMs` |

**`wrangler.toml` now has no `[vars]` block at all**, deliberately — leaving one
would recreate the two-places problem the file was created to solve.

**Precedence is env var > config file, and that is load-bearing.** It keeps
PI-7's guarantee that rollback is a Cloudflare dashboard edit taking effect on
the next request, with no deploy and no build. The config file is the default;
the dashboard is the emergency override.

**Keys still cannot live there** — the repo is public, so a key written into a
committed file is a key published. The file lists each secret *by name* with the
command to set it, so it remains the one place to **look**; only the values live
where they have to.

Verified: `npx wrangler deploy --dry-run` bundles the shared file and inlines
every value into the Worker output (`qwen/qwen3.5-flash-02-23`,
`gemini-2.5-flash`, the origin list), reporting **no bindings** — confirming
nothing is left in `[vars]`. `npm run build` inlines the same values into the
frontend bundle with no env var set. `config/` is covered by eslint, checked by
planting an unused variable and watching it fail.

### Test environments are built, not spelled out — 2026-08-11

The config change broke twenty worker tests on the first run. Siva's read of
that was right and is now the rule:

> "this is our responsibility to set standards to path, not assigning static
> values in middle of the file"

The tests had `{ GEMINI_API_KEY: "test-key", ... }` written inline at a dozen
sites, and several never named a provider at all — they passed because the
*ambient* default happened to be Gemini. Tests about schema shape, escalation
and confidence were silently depending on a value nobody had asked them to.

**The rule: a test states the environment it needs; it never inherits one.**
[`cf-worker/test-support/env.js`](cf-worker/test-support/env.js) is how it
states it — `geminiEnv()`, `openrouterEnv()`, `configuredByFileEnv()`,
`missingKeyEnv(provider)`, `loud()`. Silent by default, because a structured
log line per request across 50 tests buries the actual failure.

**Proved by flipping the config both ways.** With `ai.provider` set to
`"gemini"`, then back to `"openrouter"`, **all 222 tests pass either way**.
Before, that flip broke twenty. The one test that genuinely *is* about the
fallback now asserts against `appConfig.ai.provider` rather than a hardcoded
name, so it cannot rot when the setting changes.

Do not add an inline env object to a worker test. Add a factory.

### The live API reads, and the generated PDF — 2026-08-12

The three biggest untested things in the repo, all closed on the same day: a
real model response, real handwriting, and the actual PDF **file**. Four genuine
defects were found and fixed. **The full records are in
[`docs/history/live-api-and-pdf-verification.md`](docs/history/live-api-and-pdf-verification.md).**

The two lessons that still govern how this code is changed:

- **Never let the prompt calculate.** A rule the model can weigh against its own
  commercial intuition is not a rule. The first fix forbade dividing only inside
  one branch, passed every font-rendered mock, and then put **five wrong rupee
  figures** on screen from real photographs — at `confidence: "full"`, so nothing
  warned Dad. Only a blanket "NEVER CALCULATE… copied digit for digit" held.
  Corollary: **font-rendered mocks do not predict real handwriting.**
- **Thinking tokens share the `max_tokens` budget.** Unbounded reasoning ate a
  whole reply and returned empty after 70s. `reasoning: { enabled: false }` fixed
  the OpenRouter path. **`gemini.js` still has the same latent defect** — it sends
  no `thinkingConfig` — and was deliberately left alone because there is no
  Gemini key here to verify a change with.

Repeat runs: `npx vite-node scripts/openrouter-live-check.ts` (spends money;
deliberately not a `*.test.ts`, so CI never runs it) and
`npx vite-node scripts/pdf-check.ts`.

### PI-9 → PI-12 — DONE 2026-08-18, cross-customer copy 2026-08-19

**Spec:** [`docs/superpowers/specs/2026-08-17-pi-9-to-12-design.md`](docs/superpowers/specs/2026-08-17-pi-9-to-12-design.md)
**Plan:** [`docs/superpowers/plans/2026-08-17-pi-9-to-12-implementation.md`](docs/superpowers/plans/2026-08-17-pi-9-to-12-implementation.md)

Duplicate a quote (including to a different customer), a one-step undo for the
last voice or image import plus add-vs-set voice intent, image page reorder with
a long-read confirm gate, and the jsdom test project that finally put component
checks in the repo. **Evidence tables in
[`docs/history/pi-9-to-12-verification.md`](docs/history/pi-9-to-12-verification.md)**,
including which assertions were mutation-tested and the two genuine test defects
found along the way (a test that could not fail, and one factually wrong about
the component).

**Duplicating a quote does not breach "no price memory".** That rule forbids the
*app inferring* prices — a catalog, an index, suggestions. Duplication is Dad
picking a specific document and copying it; the app learns nothing and stores no
price history. The genuine hazard is stale prices carried forward silently, and
the design answers it by making the copy visibly a draft named after its source,
not by adding cleverness.

**Deliberately excluded from this group:** PDF upload for slips (Dad photographs
paper; `pdf.js` is a real dependency for a speculative input), customer delete
(nothing is asking for it — see KNOWN GAPS), and bug #9 (self-healing).

**`useCustomers()` lives in `AppRouter`, not `HomeScreen`** — the copy sheet
needs the list to offer another customer, and keeping the listener in
`HomeScreen` tore it down and re-established it on every navigation. Copying to
a *different* customer navigates to that customer rather than opening the
editor, because opening it would leave the header naming one customer while the
quote belongs to another.

**The caveat that matters most, kept here rather than filed away: no browser was
available for any of PI-9 → PI-12.** jsdom is not a browser — no layout engine,
no paint, no service worker, and no Web Speech API at all. So:

- **390px layout is unverified** for the copy sheet, the ▲▼ page controls and the
  long-read confirmation.
- **Nobody has spoken into a microphone against this code.** Every voice test
  fakes the recognizer.
- **Every component test fakes the network** — `readImageItems`, `saveQuote`,
  `updateCustomerDoc` and `db` are all mocked.

One trap worth not re-learning: `saveQuote` writes `customerId` from its hook's
closure, so it **cannot** write a quote for another customer and fails silently
if handed one. Cross-customer copy goes through `copyQuoteTo`, which takes the
target explicitly and has no `existingId` parameter at all.

### Deferred until Dad actually asks

- Natural-language questions over quote history. If it happens the answer is
  **not** RAG — a year of quotes fits in a single prompt. Send the whole list.
- Telugu → English item-name transliteration. Better as a lookup table Dad
  builds by using the app than as a model call.

### Before handover to Dad

**The queue lives in [`HUMAN-TASKS.md`](HUMAN-TASKS.md) — §2 (deploy the Worker,
read one real slip) and §5 (Dad's actual phone: airplane-mode cold start, the
Android share sheet, camera/mic permissions, confirm the PDF hides cost).** It
used to be restated here in full and the two copies had already begun to
disagree, so this is now a pointer on purpose.

One decision rule stays here, because it governs *planning* rather than doing:
**nothing on that list ever blocks feature work.** If a task turns out to need a
console login, a deploy, a photograph or a phone, it moves to `HUMAN-TASKS.md`
and the buildable work continues around it.

---

## Firebase config (web SDK — safe to be public)

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyCAWvi1Ekiz_smS1INzxjf5Mjk9SToKoOA",
  authDomain: "quoteapp-3f48e.firebaseapp.com",
  projectId: "quoteapp-3f48e",
  storageBucket: "quoteapp-3f48e.firebasestorage.app",
  messagingSenderId: "166477443018",
  appId: "1:166477443018:web:10d7dc1534306a1c492933",
  measurementId: "G-V9BM3DFZ6V",
};
```

---

## Rounding note (important)

Cost-side rounding sequence is TUNABLE — confirm with Siva against a real quote from Dad.
Customer (sell) side numbers match exactly with clean direct rates.
Do not burn time forcing cost totals to the rupee until the rounding sequence is confirmed.

---

## APK build notes

- Built with Gradle using TWA (Trusted Web Activity) — wraps the hosted web app
- Android project files generated in CI, no Android project committed to repo
- Uses `assembleDebug` — works for direct sideload install, not Play Store
- To rebuild: Actions → Build Android APK → Run workflow → attach new APK to a new GitHub Release
- Firebase Spark blocks hosting `.apk` files — always use GitHub Releases for APK distribution

---

## Keeping this file current

**This file is the only context that travels.** Claude's per-project memory
lives under `~/.claude/projects/…` — it is per-machine and per-account, so it
does not reach Siva's other machines or his colleague. Anything another person
or another machine needs to know belongs here, in the repo.

When a PI item is finished, move it from **WHAT TO BUILD NEXT** to **WHAT IS
DONE** in the same commit as the code. When an audit turns up a new defect, add
it to **KNOWN BUGS** with the file and the mechanism, not just a symptom.

**Verification tables go in [`docs/history/`](docs/history/), not here.** This
file was 1,858 lines on 2026-08-19 and is read in full every session; the
evidence for finished work was most of that weight. Write the receipt in
`docs/history/`, and leave behind only what the next agent must *act* on — the
standing rules, the caveats that still bind, and a link. Nothing was deleted in
that split, and nothing should be: history that is inconvenient to read is still
the record of what was actually checked.

**`npm run sanity` catches this file drifting.** It flags stale test counts, dead
modules, unreferenced assets that still ship, secrets, and config that nothing
reads. Run it before claiming the repo is tidy — it is read-only and takes a
second.
