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

*Last updated 2026-08-07. Re-check with `git status` and `git log -1`; if this
section disagrees with git, git is right and this section is stale.*

- **Branch:** `feature/Vision_Draft`, not `main`. Branched off `a159e6a`.
- **Deploys only happen from `main`** (`deploy.yml` triggers on push to main).
  Nothing on this branch is live. PI work has to reach `main` to ship.
- **Push is Siva's job — commit locally and stop.** `git push` to `origin`
  (`sivasanka1996/quoteapp`) returns 403 because the `RevanParimi` GitHub
  account lacks write access, and Siva is resolving that with the repo owner
  out of band. Do not retry it, do not offer to, and do not list it as a
  blocker in status reports. The one consequence still worth stating: nothing
  reaches Dad until it lands on `main`.
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
npm run dev        # http://localhost:5173
npm test           # 96 unit tests (Vitest) — 23 engine, 15 format, 9 voiceParse,
                   # 16 types, 25 image-reader worker, 8 readImage
npm run lint       # eslint — clean, keep it that way (now enforced in CI)
npm run build      # production build
```

Tests are `environment: 'node'` (see `vite.config.ts`), so only pure functions
are covered. There are no component or hook tests — adding any requires
switching to jsdom first.

The one exception is the Cloudflare Worker: `cf-worker/image-reader.js` is a
plain `fetch(Request) → Response` handler, so it runs in the node environment
with `globalThis.fetch` stubbed, and its tests never touch the real Gemini API.

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

### Screen flow
```
HomeScreen (search/add customers)
  → CustomerScreen (customer's quote history)
    → QuoteEditor (edit quote, save to Firestore)
      → CustomerView (customer-facing PDF, print)
```

### Key files
```
src/
  index.css              — DESIGN TOKENS (color, type scale, spacing, radii, shadows)
  AppRouter.tsx          — view manager (home/customer/quote) + AppHeader + settings
  ErrorBoundary.tsx/css  — app-wide render-throw catcher (wraps App in main.tsx)
  AppHeader.tsx/css      — persistent app bar (logo, title, settings gear)
  HomeScreen.tsx/css     — stat tiles, APK banner, search, customer rows
  CustomerScreen.tsx/css — quote history per customer, status badges, status filter
  QuoteEditor.tsx/css    — collapsed item rows + edit sheet + blanket/summary sidebar
  CustomerView.tsx/css   — customer-facing document, column toggles, print, share
  StatusBadge.tsx/css    — quote status badge + status picker
  CompanySettings.tsx    — company name/address/phone/GSTIN/logo (localStorage)
  App.tsx                — re-exports AppRouter
  appInfo.ts             — version, APK URL, isInstalledApp() standalone detection
  firebase.ts            — Firebase init + Firestore db export
  types.ts               — shared types (UILine, Customer, QuoteDoc, QuoteStatus)
                           + pure helpers: quoteStatus, seedNextId, hasNoCost
  types.test.ts          — 16 tests (quoteStatus, seedNextId, hasNoCost, parseQty)
  useCustomers.ts        — Firestore CRUD for customers collection
                           + deleteCustomerAndQuotes(db, id): one writeBatch so
                           a customer and their quotes go together (bug #6).
                           NOTE: no screen calls delete or update — see KNOWN
                           GAPS. HomeScreen destructures add only.
  useQuotes.ts           — Firestore CRUD per customer + useAllQuotes() for home stats
  useCompanySettings.ts  — company details in localStorage (incl. validity + terms)
  sharePdf.ts            — element → A4 PDF → Web Share API (lazy-loads jspdf)
  readImage.ts           — swappable image reader (Gemini via CF Worker);
                           downscales to MAX_EDGE=1600 before upload, refuses
                           with an honest message when offline
  readImage.test.ts      — 8 tests (fitWithin downscale maths, offline guard)
  ImageReader.tsx/css    — camera/gallery UI, confirmation list before adding
  voiceParse.ts          — voice transcript parser (English + Telugu)
  voiceParse.test.ts     — 9 parser tests
  VoiceReader.tsx/css    — mic UI, language toggle, alternatives
  calc/engine.ts         — PURE calc functions (no UI, no network)
  calc/engine.test.ts    — 23 tests verifying fixture numbers
  format.ts              — Indian number formatting (lakh/crore), short form, dates
  format.test.ts         — 15 formatting tests

cf-worker/
  image-reader.js        — Gemini proxy. Schema-constrained JSON, Flash → Pro
                           retry, derived confidence, origin allowlist.
                           Deployed separately.
  image-reader.test.js   — 25 tests (structured output, escalation, confidence,
                           origin allowlist)

scripts/
  cascade-check.ts       — live check for bug #6 against the REAL Firestore.
                           Not a *.test.ts, so CI never runs it. Seeds two
                           throwaway customers, deletes one, checks the other
                           survives, cleans up after itself.
                           npx vite-node scripts/cascade-check.ts
```

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
- [x] Full visual redesign — design tokens, all four screens, mobile-first
- [x] Quote status (draft/sent/accepted/declined) — badges, filter, home stat tiles
- [x] Business / Customer view toggle in the quote editor
- [x] Collapsed item rows + bottom-sheet line editor (cost, sell, GST, profit)
- [x] Share as PDF / WhatsApp — Web Share API, falls back to file download
- [x] Voice input — en-IN default, English/తెలుగు toggle, Telugu-aware parser
- [x] Calc engine — 23 engine tests (96 across the whole suite)
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
#9 is open; the gaps are closed bugs.)

---

## KNOWN GAPS — not bugs, but not what the notes imply

Found 2026-08-07 by reviewing the whole branch against `main` before merge. The
code is correct; the surrounding claims were wider than the code.

**There is no way to delete or edit a customer in the app.** `useCustomers`
returns `deleteCustomer` and `updateCustomer`, and
[HomeScreen.tsx:20](src/HomeScreen.tsx#L20) destructures
`{ customers, loading, addCustomer }` — the other two have no call site
anywhere in `src/`. So:

- **Bug #6's fix is real, tested and unreachable from the UI.** PI-4.4 reads
  like a user-facing repair; it is a library repair. The only live caller of
  `deleteCustomerAndQuotes` is `scripts/cascade-check.ts`. Nothing regressed —
  there was no delete button before either — but do not tell Dad the delete
  behaviour changed for him, because he never had a delete button.
- **A customer added by typo is permanent** as far as Dad is concerned, and so
  is a wrong phone number, which PI-2 now prints on the To block of every
  quotation that customer receives. That is the sharper half of this gap: the
  address and phone became *customer-visible* in PI-2 while remaining
  uneditable.

Not fixed here because it is new scope, and a destructive control on a
big-touch-target phone UI needs deciding, not defaulting. Two honest options
when Siva wants it: **edit only** (lower risk, fixes the wrong-phone-number
case, which is the one that reaches a customer), or **edit plus delete behind a
type-the-name confirmation** (uses the batch that already exists and is already
proved against real Firestore). Recommend edit first; delete has no demand
behind it yet.

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

### PI-1 — Trust — DONE and VERIFIED 2026-08-05

All six items shipped and were verified by driving the **built** app in
Chromium (Playwright, against the real Firestore project). One item is
partially verified — see the note under the table.

| Item | How it was verified | Result |
|---|---|---|
| Offline persistence — reads | `firestore/[DEFAULT]/quoteapp-3f48e/main` present in IndexedDB. Firestore blocked at the network layer, page reloaded: all 6 customers and all 4 stat tiles still rendered from cache. | **PASS** |
| Offline persistence — writes | Saved a quote with Firestore blocked, then restored the network. A separate Node client then found the quote on the **server** (2 lines, totalSale ₹2000) — the queued write really did drain. | **PASS** |
| Save never hangs | With Firestore blocked, Save went to "Saved ✓" in **2560ms** (the `ACK_TIMEOUT_MS` path) and showed the "will sync when you are back online" note. Never stuck on "Saving…". | **PASS** |
| `nextId` collision | 6 `seedNextId` unit tests, plus end-to-end: reopened a saved quote and tapped Add Item — row count went 1 → 2, no duplicate. | **PASS** |
| Unsaved-changes guard | Back straight after saving → no prompt. Edit the quote name, then Back → prompt appears. | **PASS** |
| Error boundary | Put a `throw` in `HomeScreen`'s render and rebuilt: got the recovery card ("Something went wrong" + Back/Reload), root HTML 498 bytes, not a blank page. Throw removed and rebuilt clean. | **PASS** |
| No-cost warning | 5 `hasNoCost` unit tests, plus end-to-end on an item with a sell rate and no cost: cost-side ₹0 warning, `no cost` row chip, and the profit panel reading "1 item has no cost entered… this profit is overstated". | **PASS** |

**Scope of "offline" above: the data layer only.** Each check aborted requests
to the app's single off-localhost endpoint —
`POST firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel`,
the WebChannel stream `onSnapshot` runs on. `localhost` stayed reachable, so
the app shell always loaded from the server. Whether the *service worker*
serves the shell with the network fully cut is untested: the SW never reaches
`active` under Playwright (headed or headless), and that is the harness, not
the build — `sw.js` is served as `text/javascript` and all 25 precache URLs
return 200. Deferred to the pre-handover list; it is pre-existing PWA
behaviour, not something PI-1 touched.

Tests are `environment: 'node'`, so anything touching the DOM needs a jsdom
switch in `vite.config.ts` first. Do not add a half-configured test setup just to
claim coverage — a manual check honestly reported is better than a fake test.

**How to re-run these checks.** They are not in the repo (they need Playwright,
a Chromium download and a live Firestore). Recipe: `npm run build && npm run
preview`, drive `localhost:4173` with Playwright, abort `**://*.googleapis.com/**`
to simulate no signal, and use an obviously-named throwaway customer. Delete the
customer **and its quotes** afterwards — bug #6 means deleting the customer
alone leaves the quotes behind.

**Design note on the save path.** Firestore resolves a write promise only on
*server* ack. Offline that promise never settles, so simply awaiting it would
still hang the button even with persistence on — the original bug wearing a new
hat. `useQuotes.saveQuote` therefore races the write against a 2.5s
`ACK_TIMEOUT_MS` and returns `{ id, queued }`: `queued: true` means the
persistent cache has the data and the server has not confirmed yet, which the
editor reports as saved plus a "will sync" note. New quotes use a client-minted
`doc()` id rather than `addDoc`, so a quote created with no signal still gets a
stable id. Real failures (permission denied) still reject and surface as the
retry banner.

### PI-2 — The document — DONE and VERIFIED 2026-08-06

All five items shipped. Verified by driving the **built** app in Chromium
(Playwright, against the real Firestore project) with two obviously-named
throwaway customers, both deleted afterwards along with their quotes. 33 checks,
all passing.

| Item | How it was verified | Result |
|---|---|---|
| Customer name, address, phone | Seeded a customer with all three; the To block rendered each one. A second customer with no address or phone rendered no empty `.cv-billto-line` at all. | **PASS** |
| Date + quote number | Seeded `createdAt` = 06 Aug 2026 14:23; the document read `Q-260806-1423` and `06 Aug 2026`. | **PASS** |
| Number matches before and after the first save | New quote → Customer view **without saving** → `Q-260806-1234`. Back, Save, Customer view again → identical. Closed and reopened from the customer's history → still identical. | **PASS** |
| Validity + terms | Set in company settings with a multi-line terms block; both printed under the totals and the terms kept all 3 lines (`white-space: pre-line`). Cleared → the whole block disappeared. | **PASS** |
| Consistent `₹` | Every money cell and all three totals: `₹120`, `₹2,280`, `₹2,400`, `₹432`, `₹2,832`. | **PASS** |
| Fractional quantities (bug #5) | 2.5 m at ₹48: business row `2.5 × 48.00`, amount `120` — not `96`. Document showed qty `2.5` and `₹120`. | **PASS** |
| Nothing renders as `undefined` | Full document and bare document both scanned for `undefined` / `NaN` / `[object` — clean. | **PASS** |
| Header does not overflow a phone | At 375px the No./Date column wraps below the title (`flex-wrap: wrap`), the row does not overflow (scroll 291 = client 291) and the page does not scroll horizontally. | **PASS** |

**Two defects the whole-branch review caught, both fixed before merge.** Neither
was visible to a single task's review — each needed two tasks side by side.

1. **`Subject: Untitled` on the customer's document.** `saveQuote` had always
   stored `name.trim() || "Untitled"` as an internal placeholder, which was
   harmless while the quote name only fed the PDF *filename*. PI-2 promoted it
   to a rendered `Subject:` line, so reopening an unnamed quote and sharing it
   sent the customer a quotation reading "Subject: Untitled". `saveQuote` now
   stores the name as typed, each display site applies its own fallback, and the
   editor treats a stored `"Untitled"` as no name so quotes saved before the fix
   are covered too. The quote *list* still shows "Untitled", which is where that
   label belongs.
2. **The image and voice confirm-list qty and rate fields could not take a
   decimal point.** Both were controlled by a *number* and re-parsed on every
   keystroke, so React restored the committed value and erased the in-progress
   `"2."` — typing `2.5` produced **25**, and on the rate field `12.5` produced
   **125**. They now hold the in-progress text as a string and parse once at
   commit, matching what the quote editor's own qty field already did. Task 2
   had given these fields `inputMode="decimal"`, so the keypad was offering a
   key the field rejected.

Re-verified in the browser after those fixes: a legacy `"Untitled"` quote prints
no subject line and the word appears nowhere on the document, a named quote
still prints its subject, and the quote list still labels unnamed quotes.

**The document does not reflow, and that is deliberate** (this closed bug #8).
`sharePdf` rasterises `.cv-doc` with html2canvas at whatever width it happens to
be rendered at, so a responsive document meant *the file a customer received
depended on the screen it was shared from* — on a phone the item table
overflowed and the Amount column was cut out of the PDF entirely. `.cv-doc` is
now pinned to `width: 760px` on screen, so the shared file is identical from a
phone or a desktop; verified at 360, 375, 414, 820 and 1280px, all rendering
760px with nothing outside the captured node.

The cost is that the preview scrolls sideways on a phone — Dad sees the left of
the document and swipes for the totals. That is the right trade: a preview that
fits the screen but misrepresents the output is worse than one he has to nudge,
and every other PDF on a phone behaves this way. The `flex-wrap` on `.cv-docmeta`
is now dead weight at a fixed width; it is left as insurance.

Do not make the document responsive again without re-reading this. If the
preview needs to fit a phone screen, scale it (`transform`) rather than reflow
it — and check what html2canvas does with the transform before trusting it.

**The business view deliberately has no `₹`.** PI-2 item 4 scoped the symbol to
the home tiles and the customer-facing document. The editor's own dense number
columns were left alone.

**Bug #5's closure is precise.** The named mechanism — `parseInt(l.qty)` in five
places — is gone, replaced by one tested `parseQty` in `types.ts`. The *voice*
path still reads a leading decimal as part of the item name, and that is
deliberate: in this domain "1.5 sq" and "2.5 sq" are item names, and the idiom is
quantity-first-as-a-whole-number — the existing test
`parseTranscript("6 wire 1.5sq rate 1650")` expects qty 6, name "wire 1.5sq".
Teaching that regex decimals would parse "2.5 sq wire" as qty 2.5 of "sq wire",
turning a correct parse into a wrong one. A fractional quantity from a voice
import is entered by editing the qty field afterwards, which now works.

**What this did not check:** the actual generated PDF. Every check reads the DOM
that `sharePdf` rasterises, not the file html2canvas produces. That gap is how
bug #8 above stayed invisible until the table was measured — worth remembering
before trusting a DOM check to speak for the PDF.

### PI-3 — Sharpen the AI paths — 5 of 7 DONE 2026-08-07, NOT DEPLOYED

**Decision, 2026-08-05, unchanged: do not switch models, and do not add
embeddings or a vector DB.** Gemini 2.5 Flash is the right tier for this. The
weak link was the prompt layer, not the model.

| Item | How it was verified | Result |
|---|---|---|
| 1. Structured output — `responseMimeType` + `responseSchema` replace the ```json fence hunt | 16 worker unit tests with `globalThis.fetch` stubbed: the request carries `responseMimeType: "application/json"` and a schema with name/qty/rate; a blank name is dropped; a missing rate stays `null` rather than becoming 0. Field names and the uppercase `Type` enum checked against Google's `generateContent` API reference. | **PASS (no live API call)** |
| 3. Downscale before upload | Real Chromium against the dev server, calling the app's own `prepareImage`. A 4000×3000 photo (6155 KB) uploaded as 646 KB of base64 at exactly 1600×1200; an 800×600 photo was left at 800×600, not enlarged. | **PASS** |
| 4. Escalate on retry only | Unit tests: Pro is not called when Flash reads the list; Flash returning zero items, HTTP 429, or a thrown request each escalate to `gemini-2.5-pro`; Pro is tried once, never in a loop. | **PASS (no live API call)** |
| 5. Honest offline message | Real Chromium with `context.setOffline(true)`: `readImageItems` rejects with "No internet connection — reading a photo needs one", not the configuration error and not a bare `TypeError`. | **PASS** |
| 7. `confidence` made honest | Unit tests: `"full"` only when every row has a qty **and** a rate, `"partial"` when a rate or qty is missing, `"low"` when nothing was read. | **PASS** |

**Item 2 (few-shot examples) is the one thing still open, and it is blocked on
Siva, not on code.** Tracked in [`HUMAN-TASKS.md`](HUMAN-TASKS.md) §4. It needs
two or three photos of Dad's *actual* order slips to paste into the prompt. Get
the photos, then add them as `inline_data` parts ahead of the real image in
`readWith`.

**No training and no ML are involved, despite how "few-shot" sounds.** The
request today is *instructions + Dad's photo*; few-shot makes it *instructions +
example photo + that example's correct answer + Dad's photo*, all in the same
JSON body. Gemini copies the pattern in-context. No weights change, nothing is
stored, nothing is fine-tuned — the cost is a few extra tokens per read. The
examples must be Dad's real slips because they only help if they match what he
actually sends; invented handwriting shows the model a pattern it will never see
again, which is worse than no example at all.

**None of the worker half is live** — and PI-4.2's origin allowlist has since
landed on the same undeployed file, so one `wrangler deploy` now ships both.
`cf-worker/image-reader.js` is committed but not deployed — deploying needs
`npx wrangler deploy` from `cf-worker/`, and per the Deploy section that takes
effect for Dad immediately, independent of this branch. The client half (downscale, offline message) ships normally with
`main`. The two halves are independent: an old worker handles a downscaled
image fine, and a new worker handles a full-size one fine, so they can go out
in either order.

**What this did not check: any of it against the real Gemini API.** Every worker
test stubs `fetch`, so no request built by this code has ever received a real
200. The schema is right per Google's published reference, but the first real
proof will be the first photo read after deploy — read one before assuming it
works. Two specific things to watch on that first read:

- `maxOutputTokens` is still 8192 and thinking tokens count against it on the
  2.5 models. It was left alone deliberately: that limit is what the live worker
  runs today, so it is known to be survivable for Dad's slips, and changing it
  blind is a worse bet than leaving it. If long lists come back empty, this is
  the first suspect.
- The Pro retry doubles the worst-case wait on a bad read. It only fires when
  Flash already returned nothing, so the average read is unchanged.

The ImageReader panel also grew an offline banner and a "N items still need a
qty or rate — fill it in here, or the line is added at ₹0" warning on the
confirm list. That warning closes a real gap: a null rate becomes a blank
`sellRate`, and PI-1's existing no-cost warning only covers the *cost* side, so
nothing used to catch a sell-side ₹0.

**Both of those UI pieces are now verified — 2026-08-07, 23 checks, all
passing.** They were the last "never rendered" claim in the code. Driven in
Chromium against the built app and the real Firestore, with **only the Gemini
proxy intercepted at the network layer** — so the component, `readImageItems`,
and the whole client path are the real ones, and no worker deploy or API key was
needed. One throwaway customer per run, deleted afterwards; Save was never
pressed, so no quote document was ever written.

| Item | How it was verified | Result |
|---|---|---|
| Offline banner | Absent while online; `context.setOffline(true)` made `.ir-offline` appear reading "No internet connection… the rest of the app keeps working offline"; going back online cleared it. | **PASS** |
| Incomplete-row warning | A canned 3-item read (one complete, one with `rate: null`, one with `qty: 0`) produced "**2 items still need** a qty or rate — fill **them** in here, or the line is added at ₹0". | **PASS** |
| Warning counts *and* grammar | Filling the missing rate dropped it to "**1 item still needs** … fill **it** in here" — the singular branch renders correctly. Filling the zero qty removed the warning entirely. | **PASS** |
| Both conditions counted | A missing rate and a zero qty each count, confirming the `_rateRaw === "" \|\| !(parseQty(_qtyRaw) > 0)` pair. | **PASS** |
| Decimal entry (PI-2 regression) | Typed `2.5` into qty and `12.5` into rate keystroke-by-keystroke; fields held `"2.5"` and `"12.5"`, not `25` and `125`. | **PASS** |
| Values reach the quote | The row rendered `2.5 × 12.50` and an amount of `31` — so the fraction really multiplied. Checked on the row's own cell, **not** a page-text search for "2.5", which the item name "Copper Wire 2.5sq" would have satisfied on its own. | **PASS** |
| Checkbox count | "Add 3 items to quote" → unchecking a row → "Add 2 items to quote". | **PASS** |
| Clean render | All three names carried into the editor; no `undefined`/`NaN`/`[object`; no uncaught page errors. | **PASS** |

**What this still does not check:** the real Gemini response. The proxy was
faked, so this proves the *panel* handles a well-formed reply correctly — it says
nothing about what Gemini actually returns. That gap closes only on the first
real read after the worker is deployed. The harness is not in the repo (it needs
Playwright and a live Firestore); recipe is the same as PI-1's, plus
`page.route(PROXY_URL, …)` to serve the canned items.

6. Keep the browser Web Speech API for voice — free, shipped, good enough. Only
   revisit (AI4Bharat IndicWhisper is the best fit) if Dad complains about
   Telugu accuracy. **No work needed; nothing was changed here.**

**The VoiceReader panel is now verified too — 2026-08-07, 26 checks, all
passing.** It had the same gap ImageReader did: `voiceParse` was unit-tested,
the panel around it had never been drawn. The Web Speech API does not exist in
headless Chromium, so `window.SpeechRecognition` was replaced with a mock that
fires `onresult`/`onerror`/`onend` on command — the component, `parseTranscript`
and the confirm path are all real, only the recognition engine is faked.

| Item | How it was verified | Result |
|---|---|---|
| Language toggle | English active by default with the English example; picking తెలుగు flipped `aria-pressed`, switched the example and hint to Telugu script, and wrote `te-IN` to `quoteapp.voiceLang`. | **PASS** |
| Language persists | Closed and reopened the panel — still Telugu, since the choice is read from localStorage on mount. | **PASS** |
| `stageRef` guard, both directions | Recognition ending *while listening* returned the panel to idle rather than leaving it stuck on "Listening…" — the exact regression the ref exists to prevent. Ending *after* a result left the confirm screen intact. | **PASS** |
| Error branches | `no-speech` → "No speech detected"; `not-allowed` → "Microphone permission denied". Each renders its own message, not the generic one. | **PASS** |
| Alternatives | Three alternatives came back; the top one showed as "I heard", and exactly the other two rendered as chips. Picking one replaced the transcript **and** re-parsed name/qty/rate from it. | **PASS** |
| Parse into fields | `"6 wire 1.5sq rate 1650"` filled name `wire 1.5sq`, qty `6`, rate `1650` — the quantity-first idiom bug #5's closure note describes, working in the UI. | **PASS** |
| Decimal entry | Typed `2.5` and `12.5`; fields held them, and the resulting quote row read `2.5 × 12.50` with an amount of `31`. | **PASS** |
| Add gating | Disabled with an empty name, re-enabled once one is typed. | **PASS** |

Same harness caveats as the ImageReader run: not in the repo, one throwaway
customer per run deleted afterwards, Save never pressed. And the same limit —
this proves the panel handles well-formed recognition results, not that Chrome's
recogniser hears Dad's Telugu correctly. Only he can tell you that.

### PI-4 — Hygiene — 7 of 8 DONE 2026-08-07

Everything here is done except **PI-4.1**, which needs Firebase console access.

| Item | How it was verified | Result |
|---|---|---|
| 2. Worker answers only the app | 9 new worker tests: the app origin and both localhost ports are reflected back by name; an unknown origin gets 403 and Gemini is never called; a request with **no** Origin gets 403 too; a refused origin is never reflected; `/list` is behind the same check; `Vary: Origin` is set. | **PASS (no live API call)** |
| 3. Dead code deleted | `QuoteDrawer.tsx/css` and `useQuoteStorage.ts` imported by nothing but each other, confirmed by grep across `src/`. Lint and build clean afterwards. | **PASS** |
| 4. Cascade quote deletion (bug #6) | `scripts/cascade-check.ts` against the **real** Firestore. Against the old code: "2 orphan(s) left behind", 3 of 6 checks failed. Against the fix: all 6 pass — victim's quotes gone, bystander's customer and quote untouched. | **PASS (live Firestore)** |
| 5. Stale index dropped | `useQuotes` issues one equality filter and sorts client-side, so no composite index applies. | **PASS** |
| 6. Version drift | Releases API says latest is v1.4 and `APK_URL` already pointed there. Relabelled rather than "fixed" — see the note under Live URLs. | **PASS** |
| 7. Lint in CI | Ran `npm run lint` clean before wiring it into `deploy.yml`, so it cannot fail the first deploy that hits it. Its reach was widened on 2026-08-07: the only config block matched `**/*.{ts,tsx}`, so the gate walked `cf-worker/image-reader.js`, its test and `eslint.config.js` with no rules at all. Separate blocks now lint them under `globals.serviceworker` and `globals.node`. | **PASS** |
| 10. Keystore password | Gradle reads `KEYSTORE_PASSWORD` from the environment; a missing value fails with a message naming the setting. | **PASS (not run — workflow_dispatch only)** |
| 8, 9. README, `.env.example` | Were already done; the list was stale. | — |

**Two things need a human before the next APK build or worker deploy:**

- **Add a `KEYSTORE_PASSWORD` secret** (Settings → Secrets and variables →
  Actions) with the current value, or the next APK build fails with the
  message above. `quoteapp123` is in the public git history for good — moving
  it out stops republishing it, it does not unpublish it. Actually retiring it
  means a new keystore and therefore a new signing key, which Android will not
  install over the existing app: Dad would have to uninstall and reinstall.
  Worth doing when he is around, not silently.
- **The worker allowlist is not deployed.** `npx wrangler deploy` from
  `cf-worker/` takes effect for Dad immediately. Read a real photo straight
  after. If it fails, this is the first suspect and the revert is one line
  plus a redeploy.

**1. Single shared Google sign-in + `if request.auth != null` — MOVED TO LAST,
2026-08-07.** Siva's call: "can't we put the firebase at the end of all the
tasks, we need to finish things before checking these." It is no longer item 1
of PI-4 — it is **the final task in the whole plan**, after every other PI item
is genuinely done. Reason to reorder: it was the only console-gated item sitting
at the top of a list of buildable work, so it kept reading as the next thing up
and stalling progress reports on a blocker nobody here could clear. It is also
the item this file has always called a *nuisance* risk, not a breach risk.

Do not raise it as "next" until everything else is finished. Two hard blockers,
neither of them code:

- Enabling Google as a sign-in provider is a Firebase **console** action. There
  is no console access here, and half-built auth is worse than none.
- `deploy.yml` deploys `firestore:rules` automatically on every push to `main`.
  Committing `if request.auth != null` before a working sign-in UI exists would
  **lock Dad out of every quote the moment that deploy lands**. The rules and
  the client have to go out together, verified together.

When it is done, check what auth does to PI-1's offline story: Firestore serves
cached reads with a cached token, but token *refresh* needs network, so an
airplane-mode cold start after a long gap is the case to test. Until then this
stays what CLAUDE.md has always called it — a nuisance risk, not a breach risk,
and never a blocker.

### Deferred until Dad actually asks

- Natural-language questions over quote history. If it happens the answer is
  **not** RAG — a year of quotes fits in a single prompt. Send the whole list.
- Telugu → English item-name transliteration. Better as a lookup table Dad
  builds by using the app than as a model call.
- Undo for the last voice action; voice editing of existing lines (voice only
  ADDS today).

### Before handover to Dad

*All of this is human work — the full, current queue with exact steps is
[`HUMAN-TASKS.md`](HUMAN-TASKS.md). Kept here too because it is part of the plan.*
- **Deploy the worker and read one real order slip.** `npx wrangler deploy` from
  `cf-worker/`, then photograph an actual slip and check the items come back.
  PI-3's worker changes have never touched the real Gemini API — every test
  stubs `fetch`. If the read comes back empty, suspect `maxOutputTokens` first.
  Two distinct failures to tell apart on that first read: **403** means PI-4.2's
  origin allowlist rejected the app (wrong hostname in `ALLOWED_ORIGINS`), while
  an **empty item list** is the Gemini side. Read from the live site, not a file
  opened off disk — a `file://` page sends `Origin: null` and will be refused.
- Test on his actual phone/browser
- **Share a real PDF from a phone-width browser and open the file.** Bug #8:
  with all five columns on, the Amount column can be clipped out of the shared
  PDF. Every PI-2 check read the DOM, not the generated file.
- **Airplane-mode cold start.** Load the live site with signal, force-close it,
  turn on airplane mode, reopen. Customers and quotes must list. This is the
  one PI-1 claim no automated check could reach — it needs the service worker
  active, which only happens in a real browser.
- Walk him through camera + mic permissions (one-time)
- Confirm the customer PDF hides cost/profit before he sends one

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
