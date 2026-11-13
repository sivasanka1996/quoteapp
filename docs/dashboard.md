# Dashboard

## Status
Built — Step 2 in [ROADMAP.md](ROADMAP.md).

## What it does
The app root. Shows five headline stat tiles (Total Customers, Quotes This
Month, Pending Quotes, Accepted Value, Unpaid Invoices), the APK download
banner, and a row of module tiles. All three business module tiles
(Quotations, Pricing, Billing) are live.

## Key files
- `src/dashboard/Dashboard.tsx` + `.css` — stat tiles, APK banner, module
  tile grid. The stats grid is `grid-template-columns: repeat(auto-fit,
  minmax(150px, 1fr))` rather than a fixed column count, specifically so
  adding the 5th (Unpaid Invoices) tile in Step 6 didn't need a CSS change.
- `src/AppRouter.tsx` — parses the URL into a `Route` union (`dashboard` /
  `ideas` / `pricing` / `quotations-*` / `billing-*`) and resolves
  `customerId`/`quoteId`/`invoiceId` from the URL back into real
  `Customer`/`QuoteDoc`/`InvoiceDoc` objects via
  `useCustomers`/`useQuotes`/`useInvoices` — see [ROADMAP.md](ROADMAP.md)'s
  Architecture stance for the routing approach
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
  all resume exactly where Dad left off. Billing's `/billing/...` routes
  (Step 6) mirror this exactly.
- **Unpaid Invoices is the one Billing figure that belongs on the
  overview** — everything else about an invoice (which customer, which
  items, exact payment status) is per-customer detail that belongs in
  Billing itself, same reasoning as why Quotations only contributes
  count/pending/accepted-value here, not a full quote list.
- `src/` reorganized into one folder per module (`dashboard/`, `quotations/`,
  `ideas/`, `pricing/`, `billing/`) plus `src/shared/` for cross-module code
  — see [ROADMAP.md](ROADMAP.md).

## Open questions / not yet decided
- Whether Dashboard needs its own stat for Pricing (e.g. catalog size).
