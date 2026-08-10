<div align="center">

# Quotation App — End-to-End Design

**One React app · one managed database · one 200-line edge function.**
No servers to run, no containers, no Python, entirely on free tiers.

`React 19` · `TypeScript` · `Vite 8` · `Firestore` · `Cloudflare Workers` · `Gemini 2.5` · `Vitest`

*Written 2026-08-08 on `feature/Vision_Draft`. Companion to
[CLAUDE.md](CLAUDE.md) (the plan and its history) and
[HUMAN-TASKS.md](HUMAN-TASKS.md) (work blocked on a person).
Where this file and `git` disagree, `git` is right.*

</div>

---

## Contents

| | |
|---|---|
| [1. What the app is for](#1-what-the-app-is-for) | The domain, in one screen |
| [2. System at a glance](#2-system-at-a-glance) | Every moving part |
| [3. What counts as "the backend"](#3-what-counts-as-the-backend) | **Read before looking for a server** |
| [4. Screen flow](#4-screen-flow) | Four screens, one path |
| [5. Data model](#5-data-model) | What lives where, and why |
| [6. The calc engine](#6-the-calc-engine) | The money maths |
| [7. Three ways items get in](#7-three-ways-items-get-in) | Hand, photo, voice |
| [8. Trust and offline](#8-trust-and-offline) | Why nothing hangs |
| [9. The customer document](#9-the-customer-document) | The thing Dad sends |
| [10. Guarantees the compiler enforces](#10-guarantees-the-compiler-enforces) | Not conventions |
| [11. Deploy topology](#11-deploy-topology) | Two independent pipelines |
| [12. Test topology](#12-test-topology) | What is covered, what is not |
| [13. Leftover design](#13-leftover-design) | **Swept from every plan and memory** |
| [14. Runbook](#14-runbook) | **Launch + connectivity commands** |

---

## 1. What the app is for

Dad supplies electrical materials. He takes an order, buys from a vendor,
supplies the customer, and his profit is the **gap between the vendor's discount
and the rate he quotes**. This app does that arithmetic correctly, on a phone, in
the field, and prints a customer-facing document that never leaks his cost or his
margin.

Three rules fall out of the domain and drive everything below:

| Rule | Consequence in the code |
|---|---|
| Discounts **compound**, never add | `list × (1−d₁) × (1−d₂) × …`, not `list × (1−d₁−d₂)` |
| GST is **pass-through** | It prints on the document and never enters profit |
| Cost is **private** | The customer view has no cost field to leak — enforced by the type system |

> **Scope posture.** Roughly two users, one family business. Not a product, not
> multi-tenant, no growth curve. The real failure modes are *Dad losing a quote*
> and *Dad reading a wrong number* — not attackers or traffic. Every design call
> below is weighted by value to one man on his phone, and prefers the fewest
> moving parts that work.

---

## 2. System at a glance

```mermaid
flowchart TB
    subgraph device["Dad's phone"]
        pwa["React PWA<br/>installed to home screen"]
        idb[("IndexedDB<br/>Firestore persistent cache")]
        ls[("localStorage<br/>company settings")]
        pwa <--> idb
        pwa <--> ls
    end

    subgraph google["Google Cloud — managed, free tier"]
        host["Firebase Hosting<br/>HTTPS · required for camera+mic"]
        fs[("Cloud Firestore<br/>customers · quotes")]
    end

    subgraph cf["Cloudflare — one edge function"]
        wk["Worker: image-reader.js<br/>origin allowlist · schema-constrained JSON"]
    end

    gem["Gemini 2.5 Flash<br/>→ Pro on retry"]
    speech["Browser Web Speech API<br/>on-device, no network"]

    pwa -->|"static assets, once"| host
    pwa <-->|"onSnapshot / writeBatch"| fs
    pwa -->|"POST base64 photo ≤1600px"| wk
    wk -->|"API key never leaves here"| gem
    pwa <-.->|"no server involved"| speech

    subgraph ci["GitHub Actions"]
        deploy["deploy.yml<br/>lint → test → build → deploy"]
        apk["build-apk.yml<br/>manual · Gradle TWA"]
    end

    deploy --> host
    deploy --> fs
    apk --> rel["GitHub Releases<br/>hosts the .apk"]
    rel -.->|"TWA wrapper"| pwa

    style wk fill:#f6ad55,stroke:#c05621,color:#1a202c
    style fs fill:#68d391,stroke:#276749,color:#1a202c
    style gem fill:#90cdf4,stroke:#2b6cb0,color:#1a202c
    style pwa fill:#d6bcfa,stroke:#553c9a,color:#1a202c
```

**The whole system is four things:** a static React bundle, a managed database,
one edge function, and two CI workflows. There is nothing else to operate.

---

## 3. What counts as "the backend"

This app has **no application server**. Nothing to `run`, no process to keep
alive, no port to bind in production. "Backend" here means two unrelated things:

| # | What | Where it runs | Launch it locally? | Language |
|---|---|---|---|---|
| 1 | **Cloud Firestore** | Google's managed service | **No — it is cloud-only.** Connect straight to the live project | — |
| 2 | **Image-reader Worker** | Cloudflare edge | **Yes** — `npx wrangler dev` on `:8787`. The only local server | JavaScript |

> ### ⚠️ There is no FastAPI, no uvicorn, and no Python here
>
> If you came looking for `uvicorn main:app --reload`, it does not exist and
> should not be added. Verified on 2026-08-08: no `*.py`, no
> `requirements.txt`, no `pyproject.toml`, no `main.py` anywhere in the tree.
> `package.json` is the **only** manifest.
>
> A `.quoteapp/` virtualenv appeared once as a stray and was deleted in PI-4. If
> it comes back, delete it again.
>
> **Why there is no Python tier at all:** the two jobs a backend would do are
> already done without one. Persistence is Firestore, which the browser SDK talks
> to directly — an API layer in front of it would add a deploy target, a cold
> start, and a second place for bugs, while *removing* the offline queue that
> PI-1 depends on. Secret-keeping is the Worker, which exists for exactly one
> reason: the Gemini API key must never reach the browser. That is ~200 lines at
> the edge, not a service.
>
> So the honest answer to "check UI + backend connectivity" is **two independent
> checks** — Firestore reads/writes, and the Worker's `POST`. §14 has both.

---

## 4. Screen flow

```mermaid
flowchart LR
    home["🏠 HomeScreen<br/>stat tiles · search · add customer"]
    cust["👤 CustomerScreen<br/>quote history · status filter<br/>✏️ edit customer"]
    qe["📝 QuoteEditor<br/>item rows · blanket discount<br/>profit summary"]
    cv["📄 CustomerView<br/>the document · print · share"]

    home -->|"tap a customer"| cust
    cust -->|"+ New Quote / tap a quote"| qe
    qe -->|"Customer view toggle"| cv
    cv -->|"close"| qe
    qe -.->|"back — guarded if unsaved"| cust
    cust -.->|"back"| home

    ir["📷 ImageReader"] -.->|"confirmed items"| qe
    vr["🎤 VoiceReader"] -.->|"confirmed item"| qe
    cust --> ir
    cust --> vr

    style cv fill:#fbd38d,stroke:#b7791f,color:#1a202c
    style qe fill:#d6bcfa,stroke:#553c9a,color:#1a202c
```

[`AppRouter.tsx`](src/AppRouter.tsx) is the view manager — a discriminated union
in `useState`, no router library. Four screens do not justify one.

> **One sharp edge, worth knowing.** `AppRouter` holds the selected customer as a
> **snapshot** and nothing re-reads it. That is why editing a customer calls
> `onCustomerChange` back up to the router: without it, Dad would save a
> corrected phone number and watch the screen keep showing the old one. It is
> also *why the correction is retroactive* — `QuoteEditor` reads the customer
> from that same object, not from the quote's denormalized copy, so fixing a
> phone number fixes quotations already saved.

---

## 5. Data model

Three stores, deliberately split by *who needs it where*:

```mermaid
flowchart TB
    subgraph fsdb["Firestore — syncs across devices"]
        c["customers/{id}<br/>name · phone · address · createdAt"]
        q["quotes/{id}<br/>customerId · customerName · name<br/>lines[] · totalSale · status<br/>createdAt · updatedAt"]
        c -.->|"customerId"| q
    end
    subgraph local["localStorage — this device only"]
        s["company settings<br/>name · address · phone · GSTIN<br/>logo · validity · terms"]
        v["quoteapp.voiceLang<br/>en-IN | te-IN"]
    end
    style fsdb fill:#c6f6d5,stroke:#276749,color:#1a202c
    style local fill:#feebc8,stroke:#975a16,color:#1a202c
```

| Decision | Why |
|---|---|
| Quotes and customers in **Firestore** | They must follow Dad between his phone and a laptop, and survive a lost device |
| Company settings in **localStorage** | One-time setup, one business, includes a base64 logo. Syncing it buys nothing and a logo in Firestore costs reads |
| `lines[]` embedded in the quote doc | A quote is always read whole. A subcollection would mean N reads to show one quote |
| `customerName` **denormalized** onto the quote | Written at save time for list display without a join |
| `totalSale` **denormalized** | The home tiles and quote list sum many quotes without parsing every `lines[]` |
| No composite index | `useQuotes` issues one equality filter and sorts client-side. The stale `customerId + updatedAt` index was dropped in PI-4.5 |

**Legacy tolerance is a requirement, not politeness.** Quotes written before
`status` existed read as `undefined`, so every read goes through
`quoteStatus(q)`, which falls back to `"draft"`. `customerPatch` reads stored
fields as `(stored[key] ?? "")` for the same reason. Both are tested.

> **Known consequence of denormalizing `totalSale` — bug #9.** A quote saved
> *before* PI-2 with a fractional quantity stored a truncated total. The editor
> and the document always recompute from `lines`, so both read correctly; the
> list row and home tiles read the stored field and stay stale until the quote is
> opened and saved once. Self-healing, and only ever toward correctness.

---

## 6. The calc engine

[`calc/engine.ts`](src/calc/engine.ts) is **pure** — no UI, no network, no
Firestore. That is what makes 23 tests able to pin the money down.

```mermaid
flowchart LR
    subgraph line["per line"]
        mode{"costMode /<br/>sellMode"}
        mode -->|"discount"| comp["list × (1−d₁) × (1−d₂)"]
        mode -->|"direct"| rate["rate as entered"]
        comp --> res["resolved unit price"]
        rate --> res
        res --> tot["× qty → round()"]
    end
    tot --> prof["lineProfit =<br/>lineSaleTotal − lineCostTotal"]
    tot --> gst["gstAmount =<br/>round(lineSaleTotal × gstPct/100)"]
    prof --> sum["totals = Σ already-rounded line values"]
    gst --> sum
    style sum fill:#9ae6b4,stroke:#276749,color:#1a202c
```

```
lineCostTotal = round(resolvedCost × qty)
lineSaleTotal = round(resolvedSell × qty)
lineProfit    = lineSaleTotal − lineCostTotal      ← pre-GST, always
gstAmount     = round(lineSaleTotal × gstPct/100)
```

**Rounding per line, then summing, is a correctness requirement — not
cosmetics.** Dad's numbers must match a hand-checked line-by-line total, so the
engine sums values that are *already rounded* rather than rounding a raw sum.
Worked example from the fixtures: `17835 × (1−0.647) × (1−0.02) = 6169.84`.

Quantities are parsed by one tested `parseQty` — wire and cable sell by the
metre, so `"2.5"` must stay `2.5`. This replaced `parseInt(l.qty)` in five
places, which silently billed 2.5 m as 2 m (bug #5).

> **Open design question, needs a real quote from Dad.** The *cost-side* rounding
> **sequence** is tunable and unconfirmed. Sell-side numbers match exactly on
> clean direct rates. Do not burn time forcing cost totals to the rupee until
> Siva confirms the sequence against a real vendor quote.

---

## 7. Three ways items get in

Every automated path ends at a **confirmation list**. Nothing is ever added to a
quote without Dad seeing it first.

```mermaid
sequenceDiagram
    participant D as Dad
    participant UI as ImageReader
    participant R as readImage.ts
    participant W as CF Worker
    participant G as Gemini

    D->>UI: photograph the order slip
    UI->>R: readImageItems(file)
    R->>R: offline? → refuse with an honest message
    R->>R: downscale to 1600px long edge<br/>(6 MB photo → 646 KB POST, measured)
    R->>W: POST { imageBase64, mimeType }
    W->>W: Origin allowlist — 403 if not the app
    W->>G: Flash · responseMimeType JSON + responseSchema
    G-->>W: structured items
    alt Flash returns nothing usable
        W->>G: retry once on Pro
    end
    W->>W: normalize · derive confidence
    W-->>R: { items, confidence, notes }
    R-->>UI: ReadItem[]
    UI->>D: confirm list — edit qty/rate, untick rows
    D->>UI: "Add N items to quote"
```

| Path | Engine | Cost | Notes |
|---|---|---|---|
| **By hand** | — | — | Collapsed rows + bottom-sheet editor |
| **Photo** | Gemini 2.5 Flash → Pro on retry | ~free at this volume | Key lives in the Worker, never the browser |
| **Voice** | Browser Web Speech API | free | **On-device.** No server, no key, works in `en-IN` and `te-IN` |

**Design notes that cost real debugging to learn:**

- **Schema-constrained output, not prose parsing.** The Worker asks for
  `responseMimeType: "application/json"` plus a `responseSchema`. This deleted
  four separate parse-failure branches that used to hunt a ```` ```json ```` fence
  out of free text.
- **Escalate on retry only.** Pro runs *only* when Flash returned nothing usable,
  so the average read stays cheap and a bad read still gets a proper try.
- **`confidence` is derived, not asserted.** `"full"` only when every row has a
  qty *and* a rate; `"partial"` when something needs typing; `"low"` when nothing
  was read.
- **A missing rate stays `null`.** It must reach the confirm list as an empty
  field, not as a line priced at ₹0. The confirm list warns: *"N items still need
  a qty or rate."*
- **Qty and rate fields hold text, not numbers.** A number input re-parsed on
  every keystroke gets its value stomped mid-edit — typing `2.5` produced **25**.
  They now hold the in-progress string and parse once at commit.
- **The voice parser reads quantity-first.** `"6 wire 1.5sq rate 1650"` → qty 6,
  name `wire 1.5sq`. In this domain `1.5 sq` and `2.5 sq` are *item names*.
  Teaching that regex decimals would turn a correct parse into a wrong one.

---

## 8. Trust and offline

PI-1's theme: **Dad must never lose work and never see a wrong number.** The
design problem is subtler than "cache the data".

```mermaid
flowchart TB
    save["Dad taps Save"] --> race{"race"}
    race -->|"server acks first"| ok["Saved ✓"]
    race -->|"2.5s ACK_TIMEOUT_MS wins"| queued["Saved ✓<br/>+ 'will sync when you are back online'"]
    race -->|"genuinely rejects"| err["retry banner<br/>with the real message"]
    style ok fill:#9ae6b4,stroke:#276749,color:#1a202c
    style queued fill:#fbd38d,stroke:#b7791f,color:#1a202c
    style err fill:#feb2b2,stroke:#c53030,color:#1a202c
```

> **The trap: Firestore resolves a write promise only on _server_ ack.** Offline
> that promise **never settles**, so simply `await`-ing it hangs the Save button
> forever *even with persistence enabled* — the original bug wearing a new hat.

| Mechanism | What it buys |
|---|---|
| `persistentLocalCache` + multi-tab manager | Reads and queued writes survive no signal |
| `ACK_TIMEOUT_MS = 2500` race in `saveQuote` | The button always resolves; `queued: true` means "cache has it, server has not confirmed" |
| Client-minted `doc()` id, not `addDoc` | A quote created with no signal still gets a stable id |
| `seedNextId(lines, current)` | Reopened quotes cannot mint a duplicate line id — that collision made edits patch two rows and delete the wrong one |
| Unsaved-changes dialog + `beforeunload` | Back or swipe-away cannot silently discard edits |
| App-wide `ErrorBoundary` | A render throw gives a recovery card, not a white screen |
| "No cost" chip + profit caveat | Imported lines resolve cost to ₹0, which would report the whole sale as margin |

**The same lesson, reused correctly.** Editing a customer deliberately does
**not** `await` its write and needs **no** ack race — because it makes no promise
worth racing. Nothing there tells Dad his data is safe; the sheet closes and the
screen shows what he typed, while the cache replays the write. A genuine
rejection reverts the screen and says so, so the UI never displays a value
Firestore refused.

---

## 9. The customer document

[`CustomerView.tsx`](src/CustomerView.tsx) is a **quotation**, not a price list:
a To block from the customer record, a quote number derived from `createdAt`
(`Q-260806-1423`), the date, an optional subject, validity and terms from company
settings, `₹` on every amount — and every field hides when empty, so a customer
with no address on file still prints cleanly.

| Decision | Reason |
|---|---|
| Quote number **derived** from `createdAt`, not sequential | A counter needs a write that can fail offline — on an app whose whole premise is that nothing fails offline. Derived cannot collide and never changes |
| `createdAt` minted when the **editor opens** | A PDF shared *before* the first save carries the same number the saved quote ends up with |
| `.cv-doc` pinned to **`width: 760px`** | See the callout below |
| Column toggles (Qty, List, Discount, Rate, Amount) | Dad decides how much pricing structure to reveal |
| PDF rasterised via html2canvas | Telugu item names and the logo reproduce exactly |

> ### The document does not reflow, and that is deliberate (bug #8)
>
> `sharePdf` rasterises `.cv-doc` at whatever width it happens to be rendered,
> so a *responsive* document meant **the file a customer received depended on the
> screen it was shared from** — on a phone the table overflowed and the Amount
> column was cut out of the PDF entirely.
>
> Fixed width costs a sideways scroll in the phone preview. That is the right
> trade: a preview that fits the screen but misrepresents the output is worse
> than one Dad has to nudge. **Do not make it responsive again.** If the preview
> must fit, *scale* it with `transform` — and check what html2canvas does with
> the transform before trusting it.

---

## 10. Guarantees the compiler enforces

Not conventions — things that fail the build if broken.

| Guarantee | How |
|---|---|
| **Cost and profit can never reach the customer view** | `CustomerView` takes `CustomerLine[]`, whose `result` is `Pick<LineResult, "resolvedSell" \| "lineSaleTotal">`. There is **no cost field to leak.** CSS is not involved |
| A customer edit cannot touch `id` or `createdAt` | `CustomerEdits = Partial<Pick<Customer, "name" \| "phone" \| "address">>` |
| A blank customer name cannot be written | `customerPatch` returns `null`; the sheet also disables Save |
| A no-op edit writes nothing | `customerPatch` trims, compares, and returns `null` when nothing changed |
| Quote status is closed | `QuoteStatus` union + `quoteStatus()` fallback for pre-field docs |

Design tokens are the same idea for visuals: every colour, space, radius, type
size and shadow lives as a CSS custom property in
[`index.css`](src/index.css). Screens consume tokens — **never** hardcoded hex or
px. Money uses `.tnum` so digit columns align; touch targets are `var(--tap)` =
48px.

---

## 11. Deploy topology

**Two pipelines that do not wait for each other.** Confusing them wastes hours.

```mermaid
flowchart TB
    subgraph a["Pipeline A — the web app"]
        pushm["push to main"] --> gh["GitHub Actions deploy.yml<br/>Node 22"]
        gh --> l["npm run lint"] --> t["npm test"] --> b["npm run build"] --> fb["Firebase Hosting<br/>+ firestore:rules"]
    end
    subgraph b2["Pipeline B — the Worker, by hand"]
        dev["cf-worker/ on any branch"] --> wr["npx wrangler deploy"] --> live["ONE live URL<br/>every build already points at"]
    end
    subgraph c["Pipeline C — the APK, manual"]
        wd["Actions → Run workflow"] --> grad["Gradle TWA<br/>KEYSTORE_PASSWORD from secret"] --> relz["attach to a GitHub Release"]
    end
    style live fill:#f6ad55,stroke:#c05621,color:#1a202c
    style fb fill:#68d391,stroke:#276749,color:#1a202c
```

| | Web app | Worker | APK |
|---|---|---|---|
| **Trigger** | push to `main` | `npx wrangler deploy`, by hand | manual `workflow_dispatch` |
| **Gated on `main`?** | **Yes** | **No** | No |
| **Reaches Dad** | on the next push to `main` | **immediately, from any branch** | when he installs it |
| **Needs a login** | `FIREBASE_TOKEN` secret | Cloudflare OAuth (a human) | `KEYSTORE_PASSWORD` secret |

> **The Worker asymmetry, stated once so it is not re-learned.** `cf-worker/` is
> deployed by hand against one live URL that every build of the app already
> points at. So worker code **committed** on a branch is *not* live, and worker
> code **deployed** from a branch *is*. Keep those apart.
>
> Never `wrangler deploy --temporary` — `whoami` suggests it when you are logged
> out and it deploys to a *preview account*, giving you a green deploy that
> changes nothing for Dad.

**Version numbers are two things, not a conflict.** `APP_VERSION` (the web app,
redeployed on every push to `main`) legitimately runs ahead of `APK_VERSION` (the
newest Release with an APK attached), because the APK is only a TWA wrapper
around the hosted site. `APK_URL` is built *from* `APK_VERSION`, so the tag and
the link cannot disagree.

The APK lives on GitHub Releases because **Firebase Spark blocks hosting
executables**.

---

## 12. Test topology

```
182 tests · 9 files · all environment: 'node'
├── calc/engine.test.ts       31  the money, against fixtures (+8 numeric chain, PI-6)
├── cf-worker/…test.js        31  structured output, escalation, confidence,
│                                 origin allowlist (+6 structured logging, PI-5)
├── types.test.ts             24  quoteStatus, seedNextId, hasNoCost, parseQty, customerPatch
├── log/logger.test.ts        22  levels, debug flag, ring buffer, error normalising, sinks
├── parse/numberWords.test.ts 17  English + Telugu 1–100, multi-token numbers
├── voiceParse.test.ts        16  English + Telugu transcripts (+7 tokenizer rules, PI-6)
├── format.test.ts            15  Indian lakh/crore, short form, dates, quote numbers
├── readImage.test.ts         14  downscale maths, offline guard (+6 data-URL, PI-6)
└── log/export.test.ts        12  filename shape, line format, level selection
```

**Everything testable here is a pure function, and that is structural.**
`vite.config.ts` sets `environment: 'node'`, so there are **no component or hook
tests** — adding one requires switching to jsdom first. The engine, the
formatters, the parsers and the patch builders were all written as pure functions
precisely so they could be pinned down without a DOM.

The Worker is the one apparent exception and is not really one:
`image-reader.js` is a plain `fetch(Request) → Response` handler, so it runs in
the node environment with `globalThis.fetch` stubbed.

### What the tests do **not** cover — know these before trusting green

| Gap | Why it exists | Closes when |
|---|---|---|
| **No real Gemini call, ever** | All 25 Worker tests stub `fetch` | The first real photo read after `wrangler deploy` |
| **The generated PDF** | Every check reads the DOM `sharePdf` rasterises, not the file. This is exactly how bug #8 hid | Someone opens a shared file from a phone |
| **Service-worker offline shell** | The SW never reaches `active` under Playwright — harness limit, not a build bug | Airplane-mode cold start on Dad's phone |
| **Any component render** | `environment: 'node'` | A deliberate jsdom switch |

Browser verification is therefore done by **driving the built app in Chromium
with Playwright against the real Firestore**, throwaway data deleted afterwards.
Those harnesses are *not in the repo* — they need Playwright and a live project.
Recipes are recorded per-PI in [CLAUDE.md](CLAUDE.md).

> **Standing rule:** do not add a half-configured test setup to claim coverage. A
> manual check, honestly reported, beats a fake test.

---

## 13. Leftover design

Swept 2026-08-08 across `CLAUDE.md`, `HUMAN-TASKS.md`, the PI-2 plan and spec
under [`docs/superpowers/`](docs/superpowers/), and all six project memory
files. **Nothing buildable is left in the PI plan.**

### Open — blocked on a person

| Item | Source | Blocked on |
|---|---|---|
| **PI-3.2 — few-shot examples** in the Gemini prompt | PI-3 | 2–3 photos of Dad's *real* order slips. Invented handwriting is worse than none |
| **PI-4.1 — shared Google sign-in** + `request.auth != null` ⟵ *final task in the whole plan* | PI-4 | Firebase console. Rules and sign-in UI must ship **together** or Dad is locked out |
| Delete the stale composite index | HUMAN-TASKS §6b | Firebase console. Cosmetic |
| `KEYSTORE_PASSWORD` secret | HUMAN-TASKS §3 | GitHub settings. Next APK build fails without it |
| Deploy the Worker + read one real slip | HUMAN-TASKS §2 | Cloudflare OAuth |
| Push access (403) | HUMAN-TASKS §1 | Repo owner |
| Airplane-mode cold start · real PDF · cost hidden · permissions walkthrough | HUMAN-TASKS §5 | Dad's actual phone |
| **Cost-side rounding sequence** — tunable, unconfirmed | CLAUDE.md | One real vendor quote from Dad |

### Open by choice — do not build until asked

| Item | The answer when it is asked |
|---|---|
| **Customer delete UI** | The cascade batch already exists and is tested. Put it behind a type-the-name confirmation and say how many quotes go with it |
| Natural-language questions over quote history | **Not RAG.** A year of quotes fits in one prompt — send the whole list |
| Telugu → English item-name transliteration | A lookup table Dad builds by using the app, not a model call |
| Undo for the last voice action; voice *editing* of existing lines | Voice only adds today |
| jsdom switch for component tests | A deliberate decision, not a drive-by |

### Closed, but easy to re-open by mistake

| Thing | Status |
|---|---|
| **Fuse.js fuzzy item search** | **Never was a feature.** It appears in memory only as the *worked example* of right-sizing (fuzzy match over a plain array, **not** embeddings + a vector DB). "No inventory, no product catalog, no price memory" is a locked decision — do not build search over item names because Fuse.js is mentioned |
| Bug #9 — stale `totalSale` on pre-PI-2 fractional quotes | Open, **won't fix**. Self-healing on next save, only toward correctness |
| PI-3.6 — keep the browser Web Speech API | Settled. Revisit only if Dad complains about Telugu; AI4Bharat IndicWhisper is the fit |
| Stray `.quoteapp/` Python venv | Deleted in PI-4. Verified absent 2026-08-08 |
| Model / infra changes | **Locked:** no new models, no embeddings, no vector DB, no RAG, no AI chat |

> **Memory numbering is stale where it disagrees with the repo.** The
> `quoteapp-development-plan` memory lists PI-4 item 10 as "delete the
> `.quoteapp/` venv"; `CLAUDE.md` uses PI-4.10 for the keystore password. The
> memory file itself says `CLAUDE.md` is canonical — believe the repo.

---

## 14. Runbook

> **Prerequisite, every time on a fresh clone:** `node_modules` is not committed.
> Without `npm install`, `npm test` fails with *"'vitest' is not recognized"*.

```bash
npm install                 # REQUIRED FIRST
```

### 14.1 Ports

| Service | Port | Command | Required? |
|---|---|---|---|
| Vite dev server (HMR) | **5173** | `npm run dev` | yes |
| Vite preview (production bundle) | **4173** | `npm run build && npm run preview` | for realistic checks |
| Cloudflare Worker (local) | **8787** | `npx wrangler dev` in `cf-worker/` | only for image reading |
| Firestore | — | *nothing to launch — managed cloud* | — |
| ~~FastAPI / uvicorn~~ | — | **does not exist in this project** | — |

### 14.2 Frontend

```bash
# Everyday development — hot reload
npm run dev                 # → http://localhost:5173

# What Dad actually gets — built bundle + service worker.
# Use this for any check you intend to believe.
npm run build && npm run preview     # → http://localhost:4173
```

### 14.3 Backend #1 — Firestore (nothing to launch)

The browser SDK talks straight to the live project `quoteapp-3f48e`. The config
is committed in [`src/firebase.ts`](src/firebase.ts) and rules are currently
`allow read, write: if true`, so **the dev server is already connected** the
moment it loads. There is no emulator wired up and none is needed for two users.

```bash
# Connectivity check — end to end, against the real database.
# Seeds two throwaway customers, deletes one, proves the other survives,
# then cleans up after itself. Prints PASS/FAIL lines.
npx vite-node scripts/cascade-check.ts
```

Expect one `BloomFilter error: Invalid hash count: 0` on the console — that is
the Firestore SDK reconciling an existence filter, not a failure. Read the
PASS/FAIL lines.

**In the browser:** load `:5173`, and the four home tiles showing numbers rather
than `—` *is* the read path working. To confirm the cache, look for
`firestore/[DEFAULT]/quoteapp-3f48e/main` in DevTools → Application → IndexedDB.

> ⚠️ **This is the live database Dad uses.** Name anything you create
> obviously — `ZZ-check-*` — and delete it afterwards. Note there is no
> delete-customer button in the UI, so clean up with a script.

### 14.4 Backend #2 — the Cloudflare Worker (the only local server)

```bash
cd cf-worker

# One-time: give the local dev server a Gemini key.
# .dev.vars is the wrangler convention. It is gitignored as of 2026-08-08 —
# it was NOT before, and `*.local` never matched it, so a key written here
# would have been committable in a public repo. Verify before you write one:
#   git check-ignore -v cf-worker/.dev.vars   → must print a match
printf 'GEMINI_API_KEY=your-key-here\n' > .dev.vars

npx wrangler dev            # → http://localhost:8787
```

`wrangler` is intentionally **not** a devDependency — `npx` fetches it. It runs
locally without a Cloudflare login; only `wrangler deploy` needs OAuth.

Then point the frontend at it and restart the dev server:

```bash
# .env.local in the repo root  (copy from .env.example)
VITE_IMAGE_PROXY_URL=http://localhost:8787
```

### 14.5 UI ⇄ Backend connectivity checks

**Run these from a second terminal while both servers are up.**

```bash
# 1 — Worker is alive and accepts the app's origin (CORS preflight).
#     Expect: HTTP/1.1 204 + access-control-allow-origin: http://localhost:5173
curl -i -X OPTIONS http://localhost:8787 \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"

# 2 — Origin allowlist actually refuses a stranger (PI-4.2).
#     Expect: HTTP/1.1 403 and Gemini never called.
curl -i -X POST http://localhost:8787 \
  -H "Origin: https://not-the-app.example" \
  -H "Content-Type: application/json" -d '{}'

# 3 — A request with NO Origin is refused too. This is the one that matters:
#     CORS headers alone would still have served curl.
#     Expect: HTTP/1.1 403
curl -i -X POST http://localhost:8787 -H "Content-Type: application/json" -d '{}'

# 4 — The real path, with a real key configured.
#     Expect: {"items":[…],"confidence":"full|partial|low", …}
curl -s -X POST http://localhost:8787 \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\":\"$(base64 -w0 path/to/slip.jpg)\",\"mimeType\":\"image/jpeg\"}"
```

**Then the same thing through the UI**, which is the check that actually counts:
`:5173` → tap a customer → **📷 Read from Image** → pick a photo of an order
slip → items appear in the confirm list → **Add N items to quote** → the rows
carry the right qty and rate.

Every status code above was verified against the real handler on 2026-08-08 —
10 checks, all passing.

| What you see | Meaning | Fix |
|---|---|---|
| `403 Forbidden` | Origin allowlist refused you | Add your origin to `ALLOWED_ORIGINS`, [cf-worker/image-reader.js:35](cf-worker/image-reader.js#L35). Already allows `:5173`, `:4173` and both Firebase hosts |
| `400 imageBase64 is required` | Origin was **accepted** — you just sent no image. This is the healthy answer to `-d '{}'` from an allowed origin | Nothing; send a real image for check 4 |
| "Image reader not configured" | `VITE_IMAGE_PROXY_URL` unset | Set it in `.env.local` and **restart Vite** — Vite reads env at startup |
| "No internet connection" | The client's offline guard fired first, by design | Reconnect |
| Empty `items` list, HTTP 200 | Gemini side, not origin | Suspect `maxOutputTokens` (8192; thinking tokens count against it on 2.5 models) |
| `GEMINI_API_KEY secret not set` | No key in `.dev.vars` (local) or Worker secrets (deployed) | See §14.4 / `npx wrangler secret put GEMINI_API_KEY` |

> **Test from a served origin, never a `file://` page.** A file opened off disk
> sends `Origin: null` and is refused **by design**.

### 14.6 Full gate — run before every commit

```bash
npm run lint      # eslint, incl. cf-worker JS. Must be clean — CI enforces it
npm test          # 104 tests, all node-environment
npm run build     # tsc -b && vite build — this is where typechecking happens
```

### 14.7 Ship

```bash
# Web app — only main deploys. Push is Siva's job.
git push origin main        # → Actions: lint → test → build → Firebase Hosting

# Worker — goes live for Dad IMMEDIATELY, from any branch. Watch it after.
cd cf-worker && npx wrangler deploy

# APK — GitHub → Actions → "Build Android APK" → Run workflow
#       → download artifact → attach to a new Release
#       → then bump APK_VERSION in src/appInfo.ts to that tag
```

---

<div align="center">

**Keep this file current.** When a design decision changes, change it here in the
same commit as the code — `CLAUDE.md` carries the plan and its history, this file
carries the shape of the system, and [`HUMAN-TASKS.md`](HUMAN-TASKS.md) carries
what only a person can clear.

</div>
