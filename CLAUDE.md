# Quotation App — CLAUDE.md

## What this app is

A business app for Dad (electrical materials supplier / middleman). Built by
Siva for his dad — non-technical end user, mobile-first, Telugu-friendly.

The app is growing from a single Quotations tool into four areas: a
**Dashboard**, a **Pricing** catalog, **Quotations**, and **Billing** — plus
a dev-facing **Idea Tracker**. See [docs/ROADMAP.md](docs/ROADMAP.md) for the
full picture and current build status.

**Read `docs/` before the code when you need to know what exists, what's
planned, or why something was decided.** This file stays a short map; it
does not duplicate what's in there.

**After finishing any task (a feature, a fix, a refactor), update the
relevant `docs/` file(s) in the same turn — not batched later.** At minimum:
the module doc for whatever changed (status/what-it-does/key-files/
decisions), `docs/ROADMAP.md`'s build-order table and current-phase line if
build status moved, and `docs/DATA_MODEL.md`/`CONFIG.md` if a collection,
field, or env var was added.

- [docs/ROADMAP.md](docs/ROADMAP.md) — big picture, build order, current phase
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — every Firestore collection, whole app
- [docs/CONFIG.md](docs/CONFIG.md) — every API key / secret / env var, where it lives
- [docs/BUSINESS.md](docs/BUSINESS.md) — Dad's business domain, profit model, GST, discount math
- [docs/DEPLOY.md](docs/DEPLOY.md) — release, APK build, key rotation, rollback
- [docs/dashboard.md](docs/dashboard.md) / [pricing.md](docs/pricing.md) / [quotations.md](docs/quotations.md) / [billing.md](docs/billing.md) / [ideas.md](docs/ideas.md) — one file per module: status, what it does, key files, decisions, open questions

---

## Live URLs

- **App:** https://quoteapp-3f48e.web.app
- **GitHub:** https://github.com/sivasanka1996/quoteapp (public repo)
- **Firebase project:** quoteapp-3f48e
- **Android APK:** https://github.com/sivasanka1996/quoteapp/releases/download/v1.4/app-debug.apk
- **GitHub Release:** https://github.com/sivasanka1996/quoteapp/releases/tag/v1.4

  ⚠ `APK_URL` in `src/appInfo.ts` points at the `v1.4` release asset, but
  `APP_VERSION` in the same file says `"v1.5"`. Resolve before next release —
  see [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Stack

React + Vite + TypeScript, Firebase Firestore, Firebase Hosting, GitHub
Actions CI/CD, vite-plugin-pwa, Android APK via Gradle/TWA. No router
library, no state-management library — `AppRouter.tsx` maps real browser
URLs to screens via plain `useState` + the History API (see
[docs/ROADMAP.md](docs/ROADMAP.md)). Details and secrets map:
[docs/CONFIG.md](docs/CONFIG.md), [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run lint       # eslint — clean, keep it that way
npm run build      # production build
```

Image reading needs `VITE_IMAGE_PROXY_URL` — see
[docs/CONFIG.md](docs/CONFIG.md) for what to put in `.env.local`.

---

## Architecture stance

Single Firebase Spark-plan app. Modules (Dashboard/Pricing/Quotations/
Billing) are **code-level** boundaries — separate files/components/hooks —
not separate services, deployments, or a multi-tenant data model. That's
deliberate: one business, today; splitting infrastructure now would be pure
overhead, and the modular code can be pulled apart later if it's ever
actually needed.

Design tokens (color, type scale, spacing, radii, shadows) live in
`src/index.css` — every screen consumes them, nothing hardcodes hex values
or px spacing. Money uses `.tnum` for tabular numerals. Touch targets are
`var(--tap)` = 48px minimum.

---

## Key decisions (locked)

- GST default 18%, editable per line, pass-through only — never profit
- Discounts compound (never additive) — see [docs/BUSINESS.md](docs/BUSINESS.md)
- Customer-facing documents hide cost/profit
- Everything free — Firebase Spark plan, no Blaze
- APK hosted on GitHub Releases, not Firebase (Spark blocks executables)
- Idea Tracker and all current Firestore collections are open
  (`allow read, write: if true`) until the pre-handover auth work below

---

## Before handing the app to Dad

- Add Firebase Authentication (Google sign-in or phone OTP)
- Lock Firestore rules to authenticated users only
- Test on his actual phone/browser; walk him through camera + mic permissions
- Confirm customer-facing documents hide cost/profit before he sends one
- Resolve the APK version mismatch (see Live URLs above)
- Delete dead code: `src/QuoteDrawer.tsx`, `src/QuoteDrawer.css`,
  `src/useQuoteStorage.ts` (superseded by Firestore-backed `useQuotes.ts`;
  nothing imports them)

---

## Known gaps (Quotations, today)

- Voice input can only add items, not edit existing lines; no undo on the
  last voice action
- Telugu-spoken item names stay in Telugu script on the customer-facing
  document — transliterating needs a lookup table of Dad's actual item
  vocabulary
- Cost-side rounding sequence is tunable, not fully confirmed against a real
  quote from Dad — see [docs/BUSINESS.md](docs/BUSINESS.md)
