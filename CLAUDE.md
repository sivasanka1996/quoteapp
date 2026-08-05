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

*Last updated 2026-08-05. Re-check with `git status` and `git log -1`; if this
section disagrees with git, git is right and this section is stale.*

- **Branch:** `feature/Vision_Draft`, not `main`. Branched off `a159e6a`.
- **Deploys only happen from `main`** (`deploy.yml` triggers on push to main).
  Nothing on this branch is live. PI work has to reach `main` to ship.
- **Push access is unresolved.** `git push` to `origin`
  (`sivasanka1996/quoteapp`) returns 403 — the `RevanParimi` GitHub account
  lacks write access. Siva is sorting this out with the repo owner. Until then
  commit locally and do not burn time retrying the push.
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

> **Version drift — fix before the next release.** Four sources disagree:
> `appInfo.ts` has `APP_VERSION = "v1.5"` but `APK_URL` points at the **v1.4**
> release asset; `build-apk.yml` builds `versionName '1.5'` / `versionCode 6`.
> Verify against the actual Releases page before quoting a version anywhere.

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
npm test           # 52 unit tests (Vitest) — 21 engine, 9 format, 9 voiceParse, 13 types
npm run lint       # eslint — clean, keep it that way (NOT yet run in CI)
npm run build      # production build
```

Tests are `environment: 'node'` (see `vite.config.ts`), so only pure functions
are covered. There are no component or hook tests — adding any requires
switching to jsdom first.

**This is a Node/TypeScript project.** `package.json` is the only manifest.
There is no Python code and no `requirements.txt` is needed. If a `.quoteapp/`
virtualenv directory appears, it is a stray — delete it.

---

## Deploy

Push to `main` → GitHub Actions runs tests → builds → deploys to Firebase automatically.

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
  types.test.ts          — 13 tests (quoteStatus, seedNextId, hasNoCost)
  useCustomers.ts        — Firestore CRUD for customers collection
  useQuotes.ts           — Firestore CRUD per customer + useAllQuotes() for home stats
  useCompanySettings.ts  — company details in localStorage
  sharePdf.ts            — element → A4 PDF → Web Share API (lazy-loads jspdf)
  readImage.ts           — swappable image reader (Gemini via CF Worker)
  ImageReader.tsx/css    — camera/gallery UI, confirmation list before adding
  voiceParse.ts          — voice transcript parser (English + Telugu)
  voiceParse.test.ts     — 9 parser tests
  VoiceReader.tsx/css    — mic UI, language toggle, alternatives
  calc/engine.ts         — PURE calc functions (no UI, no network)
  calc/engine.test.ts    — 21 tests verifying fixture numbers
  format.ts              — Indian number formatting (lakh/crore), short form, dates
  format.test.ts         — 9 formatting tests

DEAD CODE — imported by nothing but each other, delete on sight (PI-4):
  QuoteDrawer.tsx/css    — pre-Firestore quote list drawer
  useQuoteStorage.ts     — pre-Firestore localStorage quote storage
```

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

**Stale index:** `firestore.indexes.json` still declares a `customerId +
updatedAt` composite index, but `useQuotes` dropped the `orderBy` and sorts
client-side (commit 1ef97d9). The index is deployed and unused.

---

## Current build status — WHAT IS DONE

- [x] **PI-1 Trust** — Firestore persistent cache (IndexedDB, offline reads +
      queued writes); `seedNextId` closes the duplicate-line-id bug; save has
      try/catch, a retry banner and an ack timeout so it can never hang;
      unsaved-changes dialog on back plus a `beforeunload` guard; app-wide
      `ErrorBoundary`; "no cost" chip, cost-side ₹0 warning and a profit-panel
      caveat on imported lines. Verified end-to-end in a real browser — see the
      PI-1 table for what was and was not checked.
- [x] Full visual redesign — design tokens, all four screens, mobile-first
- [x] Quote status (draft/sent/accepted/declined) — badges, filter, home stat tiles
- [x] Business / Customer view toggle in the quote editor
- [x] Collapsed item rows + bottom-sheet line editor (cost, sell, GST, profit)
- [x] Share as PDF / WhatsApp — Web Share API, falls back to file download
- [x] Voice input — en-IN default, English/తెలుగు toggle, Telugu-aware parser
- [x] Calc engine — 52 tests passing
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

Audited 2026-08-05. Bugs 1, 2, 3, 4 and 7 were closed by PI-1 on the same day —
see **WHAT IS DONE**. These are what is left.

5. **Quantities truncate to integers.** `parseInt(l.qty)`. Wire and cable sell
   by the metre — "2.5" silently becomes 2. Scheduled as PI-2.5.

6. **Deleting a customer orphans their quotes.** `deleteCustomer` removes only
   the customer document. The quotes survive, still counted in home stats,
   unreachable in the UI. Scheduled as PI-4.4.

(Numbering is kept from the original audit so older notes still line up.)

---

## WHAT TO BUILD NEXT — PI plan

Ordered by value to Dad. Do not jump ahead; PI-1 is what makes the app
trustworthy, and nothing else matters until it is done.

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

**Not verified: that the app *shell* opens with the network fully cut.** The
service worker registers but never reaches `active` in headless Chromium, so a
full `setOffline` reload could not be exercised — every offline check above cut
Firestore only. This is PWA behaviour that predates PI-1, not something these
changes touched, but nobody has actually watched it work. **Worth one check on
Dad's phone: put it in airplane mode and open the app cold.** If the shell does
not load, the persistent cache underneath it is moot.

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

### PI-2 — The document

The customer PDF is not yet a quotation. Missing the fields that let a business
act on it or refer back to it.

1. **Customer name + address on the document.** `customerName` is already
   passed into `CustomerView` but is only used for the PDF *filename* — it
   never renders on the page.
2. **Date + quote number.**
3. **Validity period + terms** — one editable line, stored with company settings.
4. **Consistent `₹`** — home tiles prepend it, the PDF totals do not.
5. Fractional quantities (bug #5).

### PI-3 — Sharpen the AI paths

**Decision, 2026-08-05: do not switch models, and do not add embeddings or a
vector DB.** Gemini 2.5 Flash is the right tier for this. The weak link is the
prompt layer, not the model.

1. **Structured output.** `cf-worker/image-reader.js` asks for free text, then
   regex-hunts a ```json fence out of it, with four separate branches that
   silently give up and return an empty list. Use Gemini's
   `responseMimeType: "application/json"` + `responseSchema` instead — it makes
   those failures structurally impossible. Biggest accuracy win available, ~20
   lines.
2. **Few-shot examples** — put two or three of Dad's real order slips in the
   prompt. Domain handwriting is exactly what few-shot fixes.
3. **Downscale images client-side** before base64 upload — a 12MP phone photo
   currently becomes an ~8MB JSON POST.
4. **Escalate on retry only** — if Flash returns nothing usable, retry once on
   Gemini 2.5 Pro. Cheap on average, accurate when it matters.
5. **Honest offline message** on the image reader, distinct from a generic
   failure. (The reader genuinely needs network; that is fine, it just needs to
   say so.)
6. Keep the browser Web Speech API for voice — free, shipped, good enough. Only
   revisit (AI4Bharat IndicWhisper is the best fit) if Dad complains about
   Telugu accuracy.
7. Also note: `confidence` from the worker is decorative — it returns
   `"partial"` on every success, never `"full"` or a meaningful `"low"`.

### PI-4 — Hygiene

Cheap. Do whenever there is a spare hour.

1. Single shared Google sign-in + `if request.auth != null` on Firestore rules.
2. Origin allowlist on the Cloudflare Worker — currently `*`, so the Gemini key
   is an open relay for anyone who reads the public repo.
3. Delete dead code — `QuoteDrawer.tsx`, `QuoteDrawer.css`, `useQuoteStorage.ts`.
4. Cascade quote deletion when a customer is deleted (bug #6).
5. Drop the stale composite index from `firestore.indexes.json`.
6. Reconcile version drift across `appInfo.ts`, `build-apk.yml`, and Releases.
7. Add `npm run lint` to `deploy.yml` — this file says keep lint clean, CI never
   checks.
8. Replace `README.md` — still the untouched Vite starter template.
9. Add `.env.example` documenting `VITE_IMAGE_PROXY_URL`.
10. Move the keystore password out of `build-apk.yml` (plaintext `quoteapp123`
    in a public repo) into a GitHub secret.

### Deferred until Dad actually asks

- Natural-language questions over quote history. If it happens the answer is
  **not** RAG — a year of quotes fits in a single prompt. Send the whole list.
- Telugu → English item-name transliteration. Better as a lookup table Dad
  builds by using the app than as a model call.
- Undo for the last voice action; voice editing of existing lines (voice only
  ADDS today).

### Before handover to Dad
- Test on his actual phone/browser
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
