# Quotation App — CLAUDE.md

## What this app is

A quotation app for Dad (electrical materials supplier / middleman). He takes orders, buys from vendors, supplies to customers. Profit = gap between vendor discount and customer rate. GST is pass-through and never enters profit.

Built by Siva for his dad. Non-technical end user — mobile-first, big touch targets, Telugu-friendly.

---

## Live URLs

- **App:** https://quoteapp-3f48e.web.app
- **GitHub:** https://github.com/sivasanka1996/quoteapp (public repo)
- **Firebase project:** quoteapp-3f48e
- **Android APK:** https://github.com/sivasanka1996/quoteapp/releases/download/v1.0/app-debug.apk
- **GitHub Release:** https://github.com/sivasanka1996/quoteapp/releases/tag/v1.0

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
  AppRouter.tsx          — view manager (home/customer/quote screens)
  HomeScreen.tsx/css     — customer search + add customer + APK download banner
  CustomerScreen.tsx/css — quote history per customer
  QuoteEditor.tsx        — main quote editing UI (cards, blanket discount, profit summary)
  CustomerView.tsx/css   — customer-facing PDF view with column toggles
  CompanySettings.tsx    — company name/address/phone/GSTIN/logo (localStorage)
  App.tsx                — re-exports AppRouter
  firebase.ts            — Firebase init + Firestore db export
  types.ts               — shared TypeScript types (UILine, Customer, QuoteDoc)
  useCustomers.ts        — Firestore CRUD for customers collection
  useQuotes.ts           — Firestore CRUD for quotes collection (filtered by customerId)
  useCompanySettings.ts  — company details in localStorage
  useQuoteStorage.ts     — legacy localStorage quote storage (kept, not primary)
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
- APK hosted on GitHub Releases (not Firebase — Spark blocks executables)

---

## Firestore rules

Currently open (test mode):
```
allow read, write: if true;
```
File: `firestore.rules` — deployed automatically with `firebase deploy`.

**Before handing to Dad:** add authentication + lock rules to authenticated users only.

---

## Current build status — WHAT IS DONE

- [x] Calc engine — 26 tests passing
- [x] Quote editor — card UI, blanket discount (apply to all / selected), profit summary
- [x] Discount inputs — plain number fields (Discount % + Extra disc %), no % symbol to type
- [x] Customer PDF — column toggles, company header (logo/name/address/GSTIN), print to PDF
- [x] Firebase Hosting + GitHub Actions auto-deploy on push to main
- [x] PWA — installable on phone (manifest, icons, service worker)
- [x] Customer management — home screen search/add, customer quote history, Firestore sync
- [x] Company settings — name, address, phone, GSTIN, logo upload, saved to localStorage
- [x] Save & persist — quotes saved to Firestore per customer, not localStorage
- [x] Android APK — built via GitHub Actions using Gradle/TWA, hosted on GitHub Releases v1.0
- [x] APK download banner on home screen — green banner linking to GitHub Release

---

## WHAT TO BUILD NEXT (in order)

### Step 4 — Image reading (next up)
- Upload / camera capture of handwritten or printed item list
- Send image to Gemini free tier via a serverless function
- **The Gemini API key MUST NOT be in frontend code** — use Cloudflare Workers or Netlify Functions (free, no card needed) as a proxy
- Build reader as a SWAPPABLE module (one file) so engine can change later
- Handle Telugu and English handwriting
- Return structured item list into the editable quote table
- Graceful handling when reading is partial or fails (manual entry fallback)

**Setup needed before coding:**
1. Get Gemini API key from Google AI Studio (free tier)
2. Create Cloudflare Worker or Netlify Function as the proxy
3. Store key as a runtime secret in the function — never in frontend

### Step 5 — Voice
- Mic button, browser Web Speech API (free), Telugu + English
- ALWAYS show "I heard: … — apply?" confirmation before changing any number
- Undo on last voice action
- Supports adding items and editing fields

### Before handover to Dad
- Add Firebase Authentication (Google sign-in or phone OTP)
- Lock Firestore rules to authenticated users only
- Test on his actual phone/browser
- Walk him through camera + mic permissions (one-time)
- Confirm customer PDF hides cost/profit before he sends one

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
