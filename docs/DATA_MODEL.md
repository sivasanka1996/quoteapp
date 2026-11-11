# Data model

Every Firestore collection, whole app, in one place. This supersedes any
per-feature schema notes elsewhere — if this file and a module doc disagree,
this file is correct (and the module doc needs fixing).

Project: `quoteapp-3f48e`. Rules today: `allow read, write: if true` for
every collection (test mode) — see [BUSINESS.md](BUSINESS.md) and the
handover checklist in `CLAUDE.md` for when this needs to change.

## Built today

### `customers/{id}`
```
name: string
phone: string
address: string
createdAt: timestamp          // written via serverTimestamp() — NOT a plain
                               // number despite the Customer type saying so;
                               // nothing reads/displays it today so this is
                               // latent, not yet a bug anyone's hit
```
Read/written by `src/useCustomers.ts`.

### `quotes/{id}`
```
customerId: string
customerName: string          // denormalized from customers/{id}.name
name: string                  // quote label, user-entered
lines: UILine[]                // see src/types.ts — qty/cost/sell/discount/GST
                               // per line, all fields as strings
totalSale: number             // denormalized, for list display without
                               // recomputing from lines
status?: "draft" | "sent" | "accepted" | "declined"
                               // optional — quotes saved before this field
                               // existed read as undefined; use quoteStatus(q)
                               // from types.ts, which falls back to "draft"
createdAt: number             // Date.now(), not serverTimestamp()
updatedAt: number
```
Read/written by `src/useQuotes.ts` (`useQuotes(customerId)` + `useAllQuotes()`
for the home/dashboard stat tiles).

### `ideas/{id}`
```
text: string
status: "idea" | "finalized" | "building" | "built"
service?: "dashboard" | "pricing" | "quotations" | "billing" | "general"
                               // optional — ideas saved before this field
                               // existed read as undefined; ideaService(idea)
                               // in types.ts falls back to "general"
createdAt: number             // Date.now(), not serverTimestamp()
updatedAt: number
```
Read/written by `src/useIdeas.ts`. No link to `customers`/`quotes` — this is
the dev-facing build tracker, not a business collection.

## Planned (not created yet — see [ROADMAP.md](ROADMAP.md) for build order)

### `items/{id}` — Pricing catalog (Step 3)
```
name: string
unit: string                  // e.g. "per piece", "per meter" — optional
costMode: "discount" | "direct"
costList, costDisc1, costDisc2, costRate: string   // same shape as UILine's cost fields
sellMode: "discount" | "direct"
sellList, sellDisc1, sellDisc2, sellRate: string
updatedAt: number
source: "manual" | "image"    // how the item was entered
```

### `invoices/{id}` — Billing (Step 6)
```
customerId, customerName: string
invoiceNumber: string          // placeholder scheme — see CONFIG.md / billing.md
quoteId?: string                // set when converted from a quote
lines: UILine[]                 // identical shape to quotes
totalSale: number
paymentStatus: "unpaid" | "partial" | "paid"
createdAt, updatedAt: number
```

## Shared types

`UILine` (the per-line shape used by both `quotes.lines` and the planned
`invoices.lines`) lives in `src/types.ts`. Every numeric field is a `string`
— empty stays empty instead of becoming `"0"`; the calc engine
(`src/calc/engine.ts`) does the `parseFloat(...) || 0` at its boundary, not
the UI.
