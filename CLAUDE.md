# Quotation App — CLAUDE.md

## What this app is

A quotation app for Dad (electrical materials supplier / middleman). He takes orders, buys from vendors, supplies to customers. Profit = gap between vendor discount and customer rate. GST is pass-through and never enters profit.

Built by Siva for his dad. Non-technical end user — mobile-first, big touch targets, Telugu-friendly.

---

## Live URLs

- **App:** https://quoteapp-3f48e.web.app
- **GitHub:** https://github.com/sivasanka1996/quoteapp
- **Firebase project:** quoteapp-3f48e

---

## Stack

- **Frontend:** React + Vite + TypeScript
- **Storage:** Firebase Firestore (quotes + customers sync across devices)
- **Hosting:** Firebase Hosting (HTTPS, required for camera/mic)
- **CI/CD:** GitHub Actions → auto-deploys to Firebase on every push to `main`
- **PWA:** vite-plugin-pwa, installable on Android/iOS home screen

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 26 unit tests (Vitest)
npm run build      # production build
```

---

## Deploy

Push to `main` → GitHub Actions runs tests → builds → deploys to Firebase automatically.

Secrets required in GitHub repo settings:
- `FIREBASE_TOKEN` — from `firebase login:ci`

Manual APK build: Actions → **Build Android APK** → Run workflow → download artifact.

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
  AppRouter.tsx          — view manager (home/customer/quote screens)
  HomeScreen.tsx/css     — customer search + add customer
  CustomerScreen.tsx/css — quote history per customer
  QuoteEditor.tsx        — main quote editing UI (cards, blanket discount, profit summary)
  CustomerView.tsx/css   — customer-facing PDF view with column toggles
  CompanySettings.tsx    — company name/address/phone/GSTIN/logo (localStorage)
  QuoteDrawer.tsx        — legacy local quote save/load (kept but Firestore is primary)
  App.tsx                — re-exports AppRouter
  firebase.ts            — Firebase init + Firestore db export
  types.ts               — shared TypeScript types (UILine, Customer, QuoteDoc)
  useCustomers.ts        — Firestore CRUD for customers collection
  useQuotes.ts           — Firestore CRUD for quotes collection (filtered by customerId)
  useCompanySettings.ts  — company details in localStorage
  useQuoteStorage.ts     — legacy localStorage quote storage
  calc/engine.ts         — PURE calc functions (no UI, no network)
  calc/engine.test.ts    — 21 tests verifying fixture numbers
  format.ts              — Indian number formatting (lakh/crore)
  format.test.ts         — 5 formatting tests
```

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
  createdAt: number
  updatedAt: number
```

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

---

## Firestore rules

Currently open (test mode — expires 2026-07-15):
```
allow read, write: if true;
```
File: `firestore.rules` — deployed automatically with `firebase deploy`.

**Before handing to Dad:** add authentication + lock rules to authenticated users only.

---

## What's built (Phase 1 status)

- [x] Calc engine — 26 tests passing
- [x] Quote editor — card UI, blanket discount, profit summary
- [x] Customer PDF — column toggles, company header, print to PDF
- [x] Firebase Hosting + GitHub Actions auto-deploy
- [x] PWA — installable on phone
- [x] Customer management — home screen, customer quotes, Firestore
- [x] Company settings — localStorage, logo upload
- [x] Android APK — built via GitHub Actions (Build Android APK workflow)
- [ ] Image reading — needs Gemini API key + Cloudflare Worker/Netlify function
- [ ] Voice — Web Speech API
- [ ] Auth + security rules — before handover to Dad

---

## What's next

**Step 4 — Image reading:**
- Swappable reader module (one file, engine can change)
- Gemini free tier behind a serverless function (Cloudflare Workers or Netlify — no card needed)
- The key MUST NOT be in frontend — function holds it server-side
- Frontend calls our function → function calls Gemini → returns structured item list

**Step 5 — Voice:**
- Browser Web Speech API (free)
- Always show "I heard: … — apply?" confirmation before changing any number
- Undo on last voice action

---

## Firebase config (web SDK — safe to be in frontend)

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
