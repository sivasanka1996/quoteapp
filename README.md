# Quotation App

A mobile-first quotation tool for an electrical materials supplier.

He takes orders, buys from vendors, supplies to customers. His profit is the gap
between the vendor's discount and the rate he quotes the customer. This app does
that arithmetic correctly, on a phone, in the field — and produces a clean
customer-facing document that never leaks his cost or his margin.

**Live:** https://quoteapp-3f48e.web.app

---

## What it does

- **Two views of one quote.** The business view shows cost, sell, GST and
  per-line profit. The customer view shows only the sell side, on company
  letterhead, ready to print or send over WhatsApp.
- **Compounding discounts.** `list × (1 − d1) × (1 − d2)` — the way vendors
  actually quote, not additive. A blanket discount panel applies one discount
  across all lines or a selected subset.
- **GST is pass-through.** It appears on the customer document and never enters
  the profit calculation.
- **Three ways to enter items** — by hand, by photographing a handwritten order
  list, or by speaking. Every automated path shows what it understood and waits
  for confirmation before adding anything.
- **Telugu-aware.** Voice input handles Telugu number words, digits and rate
  keywords. The PDF is rendered as an image specifically so Telugu item names
  and the company logo reproduce exactly.
- **Installable.** A PWA on iOS and Android, plus a signed Android APK.

---

## Stack

React 19 · TypeScript · Vite · Firebase Firestore · Firebase Hosting ·
vite-plugin-pwa · Vitest

Image reading runs through a Cloudflare Worker that proxies Google Gemini, so
the API key never reaches the browser.

Everything runs on free tiers — Firebase Spark, Cloudflare Workers free, GitHub
Actions.

---

## Running locally

```bash
npm install        # required first — node_modules is not committed
npm run dev        # http://localhost:5173
npm test           # 41 unit tests
npm run lint
npm run build
```

Copy `.env.example` to `.env.local` if you want the image reader to work
locally. Without it the rest of the app runs fine and the reader shows a
configuration message.

---

## Architecture

```
HomeScreen        search / add customers, headline stats
  └─ CustomerScreen    that customer's quote history
       └─ QuoteEditor       line items, pricing, margin  ← the business view
            └─ CustomerView      the document he sends   ← the customer view
```

The pricing math lives in [`src/calc/engine.ts`](src/calc/engine.ts) — a pure
module with no UI and no network, covered by 21 tests. Per-line rounding before
summing is a correctness requirement, not a cosmetic choice.

Cost and profit cannot reach the customer view: `CustomerView` accepts a
`CustomerLine[]`, a type that has no cost field. The separation is enforced by
the compiler rather than by hidden markup.

---

## Deploying

Push to `main`. GitHub Actions runs the tests, builds, and deploys to Firebase
Hosting along with Firestore rules and indexes.

The Android APK is built manually (Actions → **Build Android APK**) and attached
to a GitHub Release — Firebase's Spark plan refuses to host executables.

---

## Contributing

Read [CLAUDE.md](CLAUDE.md) first. It carries the design decisions, the known
bugs, and the prioritised roadmap, and it explains the one thing that shapes
every trade-off here: this is a local app with about two users, so the right
answer is usually the one with the fewest moving parts.
