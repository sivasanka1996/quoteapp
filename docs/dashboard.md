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
- `src/Dashboard.tsx` + `.css` — stat tiles, APK banner, module tile grid
- `src/AppRouter.tsx` — top-level `Section` state (`"dashboard" | "quotations"
  | "ideas"`; `"pricing"`/`"billing"` aren't added until those modules exist)
  plus a `QuotationsScreen` nested state for the `home → customer → quote`
  flow, same shape it always had — just hoisted one level so it persists
  under its own section
- `src/HomeScreen.tsx` — lost its stat tiles and APK banner (moved here);
  gained a `Quotations` top bar with a back-to-dashboard button, since it's
  no longer the app root

## Decisions made
- Stat-tile computation moved out of `HomeScreen.tsx`'s `useMemo` into
  `Dashboard.tsx` — it's overview data, not quotation-specific. The
  per-customer rollup (`byCustomer`, used by `HomeScreen`'s list rows) stayed
  behind — it's display logic for that list, not a dashboard stat.
- No router library; `Section` is a plain `useState` union, same
  dependency-free pattern the app already used for its screen flow.
- `QuotationsScreen` state lives in `AppRouter`, not inside `HomeScreen` —
  so navigating to Dashboard and back into Quotations resumes exactly where
  the user left off instead of resetting to the customer list.
- Pricing/Billing tiles are visible-but-disabled rather than hidden, so the
  shape of the finished app is visible even before those modules exist.

## Open questions / not yet decided
- Exact tile layout/copy once Pricing and Billing are real destinations.
- Whether Dashboard needs its own stat for Pricing (e.g. catalog size) once
  that module exists.
