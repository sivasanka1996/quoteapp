# PI-5 to PI-8 — Observability, Parsing, Providers, Multi-page

*Design spec. Written 2026-08-10. Companion to [`CLAUDE.md`](../../../CLAUDE.md)
(the plan), [`DESIGN.md`](../../../DESIGN.md) (the system as built), and
[`HUMAN-TASKS.md`](../../../HUMAN-TASKS.md) (what only a person can clear).*

Covers four PI stories agreed with Siva on 2026-08-10. They are **independent
subsystems deliberately sequenced**, not one change.

---

## 0. Evidence this design rests on

Everything below was measured on 2026-08-10, not assumed. Recording it because
the conclusions are only as good as these checks, and a later reader will want
to know which are facts and which are inferences.

### 0.1 The live worker answers anyone, and it is stale

```
curl https://quoteapp-image-reader.qouteappsub.workers.dev/list      → HTTP 200
  (no Origin header, from a shell)
```

The committed code returns **403** for a missing Origin
([cf-worker/image-reader.js:66](../../../cf-worker/image-reader.js#L66)).
A 200 therefore proves the deployed worker **predates PI-4.2**. Until
`npx wrangler deploy` runs, the Gemini key is a **free relay** for anyone who
reads the public repo.

### 0.2 Gemini 2.5 Flash reads a slip correctly — first real proof

A generated 790×280 PNG of a mock slip was POSTed to the live worker. This is
the **first genuine Gemini response this pipeline has ever produced**; every
worker test stubs `fetch`.

```json
{"items":[{"name":"1.5 SQ WIRE","qty":10,"rate":1650},
          {"name":"2.5 SQ WIRE","qty":6,"rate":2450},
          {"name":"4 SQ WIRE","qty":4,"rate":3100}],
 "confidence":"partial","notes":""}
```

HTTP 200 in **5.586s**. All three rows correct — name, qty and rate.

Two conclusions:

1. **The model is not the problem.** Any read failure Dad hits is the worker,
   the prompt, or the photo — not Gemini's capability.
2. `confidence:"partial"` on a read where *every* row has both a qty and a rate
   is the **old hardcoded constant**. PI-3.7 made it derived. This is a second,
   independent proof that the deployed worker is stale, agreeing with §0.1.

> **Caveat, stated so it is not overclaimed:** this was clean synthetic bitmap
> text, not Dad's handwriting. It proves the *pipeline*, not OCR quality on real
> slips. That still needs [`HUMAN-TASKS.md`](../../../HUMAN-TASKS.md) §2.

### 0.3 Voice has no backend at all

[`VoiceReader.tsx:73`](../../../src/VoiceReader.tsx#L73) uses
`window.SpeechRecognition || window.webkitSpeechRecognition` — the browser's
Web Speech API. **Gemini never sees audio; the Worker is not in the voice path.**
Any "the voice model is broken" diagnosis is therefore wrong by construction.
The failure is in recognition (browser/mic/permission/network) or in
`voiceParse.ts`.

### 0.4 The regex audit — 14 sites, 4 worth repairing

| Site | Mechanism | Verdict |
|---|---|---|
| [voiceParse.ts:27](../../../src/voiceParse.ts#L27) | `/^(\d+)\s*[-–]?\s+/` — qty must be a **leading digit** | **Repair.** `"six wire"` → qty 1. `"wire 6 nos"` → qty 1 |
| [voiceParse.ts:43-45](../../../src/voiceParse.ts#L43-L45) | rate must be **terminal** | **Repair.** A trailing item code parses as a price |
| [voiceParse.ts:33](../../../src/voiceParse.ts#L33) | Telugu number words, **1–10 only**; no English words | **Repair** |
| [engine.ts:41](../../../src/calc/engine.ts#L41) | `expr.split(/[+/]/)` on an internally-built string | **Repair.** Money should not round-trip through text |
| [readImage.ts:123,136](../../../src/readImage.ts#L123) | `dataUrl.split(",")[1]` | Harden — assumes data-URL shape |
| [format.ts:16](../../../src/format.ts#L16) | lakh/crore grouping lookahead | **Leave.** Machine-made digits, 15 tests |
| [sharePdf.ts:118,120](../../../src/sharePdf.ts#L118), [HomeScreen.tsx:292](../../../src/HomeScreen.tsx#L292) | filename / initials | **Leave.** Cosmetic |

**The worker has no regex left** — PI-3.1 already replaced its ```json fence
hunt with a response schema. The rot is concentrated in `voiceParse.ts`, which
is exactly what Siva reported broken.

### 0.5 OpenRouter catalogue, fetched live

`GET https://openrouter.ai/api/v1/models` → **400 models**, 237 vision-capable,
**218 with vision *and* structured output**. Cheapest of those:

| Model | $/M in | $/M out |
|---|---|---|
| `qwen/qwen3.7-flash` | 0.030 | 0.130 |
| `openai/gpt-5-nano` | 0.050 | 0.400 |
| `google/gemini-2.5-flash-lite` | 0.050 | 0.200 |
| `google/gemma-4-31b-it:free` | 0 | 0 |

At Dad's volume — a few reads a day — even the paid options cost **cents per
month**. Cost is not the deciding factor; **Telugu quality is**.

---

## 1. Decisions locked on 2026-08-10

| # | Decision | Rationale |
|---|---|---|
| D1 | Logs go to an **IndexedDB ring buffer**, exported on demand as timestamped files | A browser **cannot** write to a folder. No filesystem API, no server, and Workers have no filesystem either. This is the closest honest shape |
| D2 | **File System Access API rejected** | It would give literal folder writes, but is **unsupported on Android Chrome** — so it could never work for Dad, who is the user |
| D3 | Provider becomes **pluggable; Gemini stays default** | §0.2 proves Gemini works. Rollback becomes an env var rather than a deploy |
| D4 | `try`/`catch` **everywhere**, with **layered catch behaviour** | Siva's explicit call, reaffirmed after the trade-off was put to him. See §2.4 — the layering is what keeps it safe |
| D5 | Multi-page reads are **sequential, one call per page** | One long list against a single 8192-token ceiling is already the prime suspect for empty reads. Batching makes the known risk worse |
| D6 | `format.ts` and `sharePdf.ts` regex **stay** | Deterministic input, already tested. "No regex" is a rule about parsing *human* input |

---

## 2. PI-5 — Observability

**Ships first.** It is the instrument used to diagnose PI-6, 7 and 8. Building
it last would mean debugging the others blind.

### 2.1 Module layout

```
src/log/
  logger.ts     core — levels, scopes, dispatch, the public API
  buffer.ts     ring buffer, capped
  idb.ts        IndexedDB persistence (survives reload)
  export.ts     buffer → timestamped .log files
  logger.test.ts
```

### 2.2 Record shape

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogScope =
  | "firestore" | "voice" | "image" | "calc" | "ui" | "pdf" | "worker";

export interface LogRecord {
  ts: number;              // epoch ms — formatted only at export
  level: LogLevel;
  scope: LogScope;
  msg: string;
  data?: unknown;          // must survive structuredClone
  err?: { name: string; message: string; stack?: string };
}
```

`scope` is a closed union rather than a free string so logs stay filterable and
a typo cannot silently create a new category.

### 2.3 Levels and the debug flag

| Level | Captured | Purpose |
|---|---|---|
| `debug` | **only when the flag is on** | Verbose tracing — parse steps, payload sizes, timings |
| `info` | always | Lifecycle — quote saved, image read, N items returned |
| `warn` | always | Recovered problems — retry fired, queued write |
| `error` | always | Failures, always with `err` populated |

Flag is on when **either** `?debug=1` is in the URL **or**
`localStorage['quoteapp.debug'] === '1'`. The URL form matters: it is the only
one Siva can talk Dad through over the phone.

### 2.4 The catch-behaviour ladder — D4's safety mechanism

`try`/`catch` goes everywhere, as decided. **What the catch does differs by
layer, and that is the whole point.**

| Layer | On catch | Why |
|---|---|---|
| `calc/engine.ts` | `log.error(...)` then **re-throw** | A swallowed calc error is a **silently wrong number on a customer's quote** — the failure mode CLAUDE.md calls unacceptable. Re-throwing routes it to the existing `ErrorBoundary`, so Dad sees a recovery card, never a wrong total |
| Parsing (`voiceParse`, `readImage`) | log, return empty result | A bad parse should yield no rows, not a crash |
| I/O (Firestore, `fetch`) | log, surface the existing retry banner | Already the PI-1 pattern |
| Storage (localStorage, IDB) | log, return the default | Never fatal |
| Render | existing `ErrorBoundary` | Already built |
| Worker | log, structured error response | Never leak a stack to the client |

> **The logger must never throw.** Every sink is internally guarded and failure
> is silent. A logger that can crash the app is worse than no logger.

### 2.5 Export format

Settings → **Export logs** produces level-separated, timestamped files:

```
quoteapp-info-2026-08-10T14-23-07.log
quoteapp-error-2026-08-10T14-23-07.log
```

One record per line, newest last:

```
2026-08-10T14:23:07.412Z  INFO   firestore  quote saved  {"id":"aBc123","queued":false}
2026-08-10T14:23:11.887Z  ERROR  image      read failed  TypeError: Failed to fetch
```

### 2.6 Retention

Ring buffer caps at **2000 records or ~1 MB**, whichever comes first; oldest
evicted. IndexedDB, not localStorage — localStorage is synchronous and would
jank the UI on every write, and Firestore already uses IDB.

---

## 3. PI-6 — Remove the fragile parsing regex

### 3.1 A tokenizer, not a better regex

`parseTranscript` is rewritten as: **tokenize → classify → assemble.**

```
"6 wire 1.5sq rate 1650"
  → ["6","wire","1.5sq","rate","1650"]
  → [NUM(6), WORD, WORD, RATE_KW, NUM(1650)]
  → { qty: 6, name: "wire 1.5sq", rate: 1650 }
```

This fixes three defects in one change, because each becomes a classification
rule rather than a new branch in a regex:

| Input | Today | After |
|---|---|---|
| `six wire rate 1650` | qty **1** | qty **6** |
| `wire 6 nos rate 1650` | qty **1** | qty **6** |
| `2 wire code 4402` | rate **4402** | rate **null** |

### 3.2 Number words, both languages

Telugu 1–10 exists; **English has none**. Both extend to 1–100 in a shared
lookup table. This matters because Chrome's recogniser often returns `"six"`
rather than `"6"` — a plausible root cause of the reported failure.

### 3.3 `engine.ts` — stop round-tripping money through a string

Today discounts are formatted into `"64.7% + 2%"` and re-parsed. The chain
becomes `number[]` end to end; the string is built **only for display**.

### 3.4 Preserved behaviour — do not regress this

`"6 wire 1.5sq rate 1650"` must still give qty 6 / name `wire 1.5sq`. In this
domain **"1.5 sq" and "2.5 sq" are item names**, and the idiom is
quantity-first-as-a-whole-number. Teaching the qty rule to accept decimals would
turn a correct parse into a wrong one. The existing test is the guard.

---

## 4. PI-7 — Pluggable AI provider

### 4.1 Layout

```
cf-worker/
  index.js                routing, CORS, origin allowlist  (unchanged behaviour)
  schema.js               shared item schema
  providers/
    index.js              pickProvider(env)
    gemini.js             Flash → Pro retry  (today's proven path)
    openrouter.js         OpenRouter, vision + structured output
```

### 4.2 Contract every provider implements

```js
// → { items: [{name, qty, rate}], detail: string }
// Never throws. A failure returns items: [] with detail set.
async function read(imageBase64, mimeType, env)
```

Keeping "never throws" in the contract is what lets `index.js` stay simple: it
decides whether to escalate, and never handles exceptions.

### 4.3 Configuration

| Var | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` \| `openrouter` |
| `GEMINI_API_KEY` | — | existing secret |
| `OPENROUTER_API_KEY` | — | new secret |
| `OPENROUTER_MODEL` | `qwen/qwen3.7-flash` | overridable without a deploy |

**Rollback is an env var, not a deploy.** That is the reason for the whole
abstraction.

### 4.4 Choosing a model is an experiment, not a decision

Candidates are compared **on Dad's real slips** once
[`HUMAN-TASKS.md`](../../../HUMAN-TASKS.md) §4 supplies them. Cost is not the
deciding factor (§0.5); **Telugu accuracy is.** `qwen/qwen3.7-flash` is the
opening candidate — Qwen is the strongest multilingual line at that price — but
Gemini stays default until something beats it on real input.

---

## 5. PI-8 — Multi-page slips

A long order list runs to several pages, and today the reader takes one image.

### 5.1 Flow

```
pick N images  →  read page 1 … page N sequentially
               →  merge into ONE confirm list, each row badged "p2"
               →  add to quote as usual
```

### 5.2 Why sequential (D5)

One call per page keeps each read inside its own 8192-token budget. Batching all
pages into one request shares that budget — and `maxOutputTokens` is *already*
the first suspect for an empty read on a long list. Batching would make a known
risk worse to save a few cents.

### 5.3 Partial failure is normal, not exceptional

If page 2 of 3 fails, pages 1 and 3 are still offered, with an inline
"page 2 could not be read — retry" row. Losing the whole batch to one bad photo
is the failure Dad would actually hit, standing in a shop.

---

## 6. Sequencing

```
PI-5 Observability ──┬─→ PI-6 Parsing
                     ├─→ PI-7 Providers ──→ PI-8 Multi-page
                     └─  (logs make all three debuggable)
```

PI-5 first is a hard call, not a preference: without it, PI-6/7/8 are debugged
by guesswork. PI-8 follows PI-7 because it calls the provider layer per page.

**PI-7 and PI-8 cannot reach Dad until the worker is deployed** — that is
[`HUMAN-TASKS.md`](../../../HUMAN-TASKS.md) §2 and is human-gated. Client work
still ships through `main` as normal.

---

## 7. Testing

Tests are `environment: 'node'` (see `vite.config.ts`), so only pure functions
are covered. **No jsdom switch is in scope here** — that stays a deliberate
decision, not a drive-by.

| Area | Coverage |
|---|---|
| `logger` | Levels gate correctly; debug silent when the flag is off; buffer evicts at cap; a throwing sink never escapes |
| `voiceParse` | Every row of the §3.1 table, plus the §3.4 regression guard |
| `engine` | Existing 23 tests must stay green — the chain refactor is behaviour-preserving |
| providers | `fetch` stubbed per provider; contract holds — never throws, empty `items` on failure |
| multi-page | Merge order, page badging, partial-failure path |

> **Standing rule, restated:** do not add a half-configured test setup to claim
> coverage. A manual check, honestly reported, beats a fake test.

**What tests cannot reach, and who must do it:** real speech recognition
(needs a mic and a human voice), real OCR quality on Dad's handwriting, and the
first live read after the worker deploy. Those are Siva's, and are listed in
`HUMAN-TASKS.md`.

---

## 8. Out of scope

Named so they are not re-opened by accident:

- **No jsdom / component tests** — deliberate, unchanged
- **No embeddings, no vector DB, no RAG, no AI chat** — locked in `CLAUDE.md`
- **No customer delete UI** — still waiting on Dad actually asking
- **No auth** — PI-4.1 remains the final task in the whole plan
- **`format.ts` / `sharePdf.ts` regex stay** (D6)
- **Voice still only ADDS lines** — editing by voice is deferred
