# Roadmap

## Vision

One app, four business-facing areas for Dad's electrical supply business,
plus one dev-facing tool:

- **Dashboard** — overview: stat tiles, tiles into the other sections.
- **Pricing** — a persistent item price catalog, fed by photographing vendor
  price lists (reuses the existing image-reading pipeline).
- **Quotations** — today's existing feature, extended to pull prices from the
  Pricing catalog instead of typing them from scratch each time.
- **Billing** — invoice generation, either standalone or converted from an
  accepted quote.
- **Idea Tracker** (dev-facing, not a "business" area) — tracks the build-out
  of this project itself: raw ideas, finalized decisions, what's being built,
  what's shipped.

## Architecture stance

Single Firebase Spark-plan React app. Modules are **code-level** boundaries
(separate files/components/hooks), not separate services, deployments, or a
multi-tenant data model. This is deliberate: the app serves one business
today, and splitting infrastructure now would be pure overhead. If the
business ever needs to scale to multiple tenants, the modular code makes
that a refactor, not a rewrite.

No router library — navigation is a plain `Section` state in `AppRouter.tsx`
(`"dashboard" | "pricing" | "quotations" | "billing" | "ideas"`), same
dependency-free approach the app already used for its screen flow.

## Current phase

**Step 2 — Dashboard shell + `Section` routing.** Quotations and the Idea
Tracker are built; Dashboard/Pricing/Billing are planned, not started.

## Build order

| Step | What | Status |
|---|---|---|
| 0 | Scaffold `docs/` (this folder) | Done |
| 1 | Idea Tracker (`useIdeas.ts`, `IdeaTracker.tsx`) | Done |
| 2 | Dashboard shell + `Section` routing in `AppRouter.tsx` | Not started |
| 3 | Pricing (`usePricing.ts`, `PricingScreen.tsx`, reuses `ImageReaderPanel`) | Not started |
| 4 | Quotations ↔ Pricing autocomplete in `QuoteEditor.tsx` | Not started |
| 5 | Extract shared line-items editor out of `QuoteEditor.tsx` | Not started |
| 6 | Billing (`useInvoices.ts`, `InvoiceEditor.tsx`, `BillingScreen.tsx`, Convert-to-Invoice) | Not started |

Each step ships and is checked (`npm test`, `npm run lint`, manual pass)
before the next starts. Each step's doc update happens in the same commit as
its code — this table's Status column and each module doc are kept current
as part of the work, not batched later.

## Docs index

- [DATA_MODEL.md](DATA_MODEL.md) — every Firestore collection and field, whole app
- [CONFIG.md](CONFIG.md) — where every API key / env var / secret lives
- [BUSINESS.md](BUSINESS.md) — Dad's business domain, profit model, GST handling
- [DEPLOY.md](DEPLOY.md) — release, APK build, key rotation, rollback steps
- [dashboard.md](dashboard.md)
- [pricing.md](pricing.md)
- [quotations.md](quotations.md)
- [billing.md](billing.md)
- [ideas.md](ideas.md)
