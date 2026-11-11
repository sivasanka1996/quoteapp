# Dashboard

## Status
Not started — Step 2 in [ROADMAP.md](ROADMAP.md).

## What it does (planned)
The new app root. Shows the aggregate stat tiles that live on `HomeScreen`
today (Total Customers, Quotes This Month, Pending Quotes, Accepted Value —
plus an Invoices stat once Billing exists), the APK download banner, and
tiles that route into the other three business sections (Pricing,
Quotations, Billing).

## Key files (planned)
- `src/Dashboard.tsx` + `.css` — new
- `src/AppRouter.tsx` — gains the top-level `Section` state this routes into

## Decisions made
- Stat-tile computation moves out of `HomeScreen.tsx`'s `useMemo` block into
  here — it's overview data, not quotation-specific.
- No router library; `Section` is a plain `useState` union, same
  dependency-free pattern the app already uses for its screen flow.

## Open questions / not yet decided
- Exact tile layout/copy.
- Whether Dashboard needs its own stat for Pricing (e.g. catalog size) once
  that module exists.
