# Dashboard

## Status
Built — Step 2 in [ROADMAP.md](ROADMAP.md).

## What it does
The app root. Shows the four headline stat tiles (Total Customers, Quotes
This Month, Pending Quotes, Accepted Value), the APK download banner, and a
row of module tiles. Today only the Quotations tile is live — it routes into
the existing customer/quote flow, unchanged. Pricing and Billing tiles are
shown but disabled ("coming soon") until Steps 3 and 6 build those screens.

## Key files
- `src/dashboard/Dashboard.tsx` + `.css` — stat tiles, APK banner, module
  tile grid
- `src/AppRouter.tsx` — parses the URL into a `Route` union (`dashboard` /
  `ideas` / `quotations-home` / `quotations-customer` / `quotations-quote-new`
  / `quotations-quote`) and resolves `customerId`/`quoteId` from the URL back
  into real `Customer`/`QuoteDoc` objects via `useCustomers`/`useQuotes` — see
  [ROADMAP.md](ROADMAP.md)'s Architecture stance for the routing approach
- `src/quotations/HomeScreen.tsx` — lost its stat tiles and APK banner (moved
  here); gained a `Quotations` top bar with a back-to-dashboard button, since
  it's no longer the app root

## Decisions made
- Stat-tile computation moved out of `HomeScreen.tsx`'s `useMemo` into
  `Dashboard.tsx` — it's overview data, not quotation-specific. The
  per-customer rollup (`byCustomer`, used by `HomeScreen`'s list rows) stayed
  behind — it's display logic for that list, not a dashboard stat.
- No router library; `AppRouter.tsx` maps real URLs to a `Route` union via
  `window.location`/History API — see [ROADMAP.md](ROADMAP.md).
- Quotations' nested `home → customer → quote` flow lives in the URL itself
  now (`/quotation`, `/quotation/customer/:id`, `/quotation/customer/:id/
  quote/:id`), not in a separate React state tree — so navigating to
  Dashboard and back, or hitting browser back/forward, or refreshing mid-flow,
  all resume exactly where Dad left off.
- Pricing/Billing tiles are visible-but-disabled rather than hidden, so the
  shape of the finished app is visible even before those modules exist.
- `src/` reorganized into one folder per module (`dashboard/`, `quotations/`,
  `ideas/`) plus `src/shared/` for cross-module code — see
  [ROADMAP.md](ROADMAP.md).

## Open questions / not yet decided
- Exact tile layout/copy once Pricing and Billing are real destinations.
- Whether Dashboard needs its own stat for Pricing (e.g. catalog size) once
  that module exists.
