# PI-5 → PI-8 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app an eye (structured logging), fix the parser that is
actually broken (voice), make the AI backend swappable without a deploy, and let
Dad photograph a multi-page order list.

**Architecture:** A new `src/log/` module is the only cross-cutting addition;
everything else consumes it. `voiceParse` becomes a tokenizer instead of a regex
chain. `cf-worker/` splits into a router plus interchangeable providers behind a
one-function contract. Multi-page reading is a client-side loop over the
existing single-image endpoint — the worker does not learn about pages.

**Tech Stack:** React 19 + Vite 8 + TypeScript, Vitest 4 (`environment: 'node'`,
`npm test` runs `vitest run` — no watch mode), Firebase Firestore, Cloudflare
Workers.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-10-observability-parsing-and-providers-design.md` — read it before starting. §0 records what was measured; do not re-litigate it from memory.
- **Run `npm install` first.** `node_modules` is not committed; without it `npm test` fails with `'vitest' is not recognized`.
- **Tests are `environment: 'node'`.** Only pure functions can be tested. Do NOT add a jsdom setup to test components.
- **Commit author must be `revan.datta132@gmail.com`.** Verify with `git log -1 --format='%ae'`.
- **Branch is `feature/Vision_Draft`.** Stay on it. Do not merge to `main` — deploys trigger from `main`.
- **`npm run lint` must stay clean** and `npm test` must stay green (104 tests at the start of this plan).
- **The logger must never throw.** Every sink is internally guarded; logging failure is silent. A logger that can crash the app is worse than no logger.
- **`calc/engine.ts` catches must re-throw.** See spec §2.4. A swallowed calc error is a silently wrong number on a customer's quote.
- **Cost and profit must never reach `CustomerView`.** Unchanged rule.

---

# PI-5 — Observability

*Ships first. It is the instrument for PI-6, 7 and 8.*

### Task 1: Logger core + ring buffer

**Files:**
- Create: `src/log/logger.ts`, `src/log/buffer.ts`, `src/log/logger.test.ts`

**Interfaces:**
- Produces:
  - `type LogLevel = "debug" | "info" | "warn" | "error"`
  - `type LogScope = "firestore" | "voice" | "image" | "calc" | "ui" | "pdf" | "worker"`
  - `interface LogRecord { ts: number; level: LogLevel; scope: LogScope; msg: string; data?: unknown; err?: { name: string; message: string; stack?: string } }`
  - `log.debug(scope, msg, data?)` / `.info` / `.warn` / `.error(scope, msg, err?, data?)`
  - `isDebugEnabled(): boolean`
  - `Buffer.push(r)`, `Buffer.all(): LogRecord[]`, `Buffer.clear()`

- [ ] **Step 1: Write the failing tests** in `src/log/logger.test.ts`
  - `debug` records are dropped when the flag is off, kept when on
  - `info`/`warn`/`error` are always kept
  - buffer evicts oldest at the 2000 cap; `all()` returns newest last
  - `log.error` normalises an `Error` into `{name,message,stack}`
  - a sink that throws does **not** propagate out of `log.info`
- [ ] **Step 2: Implement** `buffer.ts` (array + cap) then `logger.ts`
- [ ] **Step 3: Verify** `npm test` green, `npm run lint` clean

### Task 2: Debug flag

**Files:** Modify `src/log/logger.ts`

- [ ] **Step 1: Test** — flag reads `?debug=1` OR `localStorage['quoteapp.debug']==='1'`; absent → off; a throwing `localStorage` → off, not a crash
- [ ] **Step 2: Implement.** Read once at module init; expose `setDebug(on)` which persists to `localStorage`
- [ ] **Step 3: Verify** tests green

> The URL form matters — it is the only one Siva can talk Dad through on the phone.

### Task 3: IndexedDB persistence

**Files:** Create `src/log/idb.ts`; modify `src/log/logger.ts`

**Interfaces:** `loadPersisted(): Promise<LogRecord[]>`, `persist(r): void` (fire-and-forget), `clearPersisted(): Promise<void>`

- [ ] **Step 1: Implement** a single `quoteapp-logs` store, keyed by autoincrement, trimmed to the cap on open
- [ ] **Step 2: Guard** every IDB call in try/catch — private-mode browsers reject `indexedDB.open`, and that must be survivable
- [ ] **Step 3: Verify** — cannot be unit-tested in `environment: 'node'`. Check manually in the browser (DevTools → Application → IndexedDB) and **report it as a manual check**, not a test

### Task 4: Export to timestamped files

**Files:** Create `src/log/export.ts`; modify `src/CompanySettings.tsx`

**Interfaces:** `exportLogs(level: "info" | "error"): void` → downloads `quoteapp-<level>-<ISO>.log`

- [ ] **Step 1: Test** the pure parts — filename shape `quoteapp-error-2026-08-10T14-23-07.log`, and one formatted line per record
- [ ] **Step 2: Implement** using a `Blob` + object URL. Line format:
  `2026-08-10T14:23:07.412Z  INFO   firestore  quote saved  {"id":"aBc123"}`
- [ ] **Step 3: Wire** an "Export logs" control into settings, plus a debug toggle and a record count
- [ ] **Step 4: Verify** tests green; download one file manually and open it

### Task 5: try/catch coverage — the ladder

**Files:** Modify `src/useQuotes.ts`, `src/useCustomers.ts`, `src/useCompanySettings.ts`, `src/readImage.ts`, `src/voiceParse.ts`, `src/sharePdf.ts`, `src/calc/engine.ts`, `src/QuoteEditor.tsx`, `src/CustomerScreen.tsx`, `src/HomeScreen.tsx`

- [ ] **Step 1:** Wrap per the spec §2.4 ladder. **Re-read it before starting** — the catch behaviour differs by layer and that difference is the entire safety argument
- [ ] **Step 2:** `calc/engine.ts` — `log.error("calc", …)` then **`throw`**. Never return a fallback number
- [ ] **Step 3:** Add `info` logs at the decisions worth reconstructing later: quote saved (with `queued`), image read (item count, ms), voice result (transcript length), PDF shared
- [ ] **Step 4: Verify** all 23 engine tests still green — the wrapping must be behaviour-preserving

### Task 6: Worker-side logging

**Files:** Modify `cf-worker/image-reader.js`, `cf-worker/image-reader.test.js`

- [ ] **Step 1:** Wrap the handler; log request id, provider, model, latency, item count
- [ ] **Step 2:** Never leak a stack trace to the client — the response keeps its existing `{error}` shape
- [ ] **Step 3: Verify** all 25 worker tests stay green

---

# PI-6 — Remove the fragile parsing regex

### Task 7: Number-word tables, both languages

**Files:** Create `src/parse/numberWords.ts`; create `src/parse/numberWords.test.ts`

**Interfaces:** `wordToNumber(token: string, lang: VoiceLang): number | null`

- [ ] **Step 1: Test** — English `one`–`hundred`; Telugu `ఒకటి`–`వంద`; unknown → `null`; case-insensitive
- [ ] **Step 2: Implement** as a lookup table, extending the existing Telugu 1–10 map to 1–100 and adding the English side that does not exist today
- [ ] **Step 3: Verify** tests green

### Task 8: Tokenizer replaces the regex chain

**Files:** Modify `src/voiceParse.ts`, `src/voiceParse.test.ts`

**Interfaces:** unchanged public shape — `parseTranscript(text: string): VoiceItem`

- [ ] **Step 1: Write the failing tests** — every row of spec §3.1:
  - `"six wire rate 1650"` → qty **6** (today: 1)
  - `"wire 6 nos rate 1650"` → qty **6** (today: 1)
  - `"2 wire code 4402"` → rate **null** (today: 4402)
  - **Regression guard:** `"6 wire 1.5sq rate 1650"` → qty 6, name `wire 1.5sq`, rate 1650
- [ ] **Step 2: Implement** tokenize → classify (NUM / NUM_WORD / UNIT / RATE_KW / WORD) → assemble
- [ ] **Step 3: Verify** all 9 original voiceParse tests still pass

> **Do not teach the qty rule to accept decimals.** "1.5 sq" and "2.5 sq" are
> *item names* in this domain. See spec §3.4.

### Task 9: `engine.ts` — stop round-tripping money through a string

**Files:** Modify `src/calc/engine.ts`, `src/calc/engine.test.ts`

- [ ] **Step 1:** Make the discount chain `number[]` end to end; build the `"64.7% + 2%"` string for **display only**
- [ ] **Step 2:** Keep `parseDiscountChain` exported — it still parses user-typed input — but nothing internal may round-trip through it
- [ ] **Step 3: Verify** all 23 engine tests green, unchanged. This is behaviour-preserving

### Task 10: Harden the data-URL split

**Files:** Modify `src/readImage.ts`, `src/readImage.test.ts`

- [ ] **Step 1: Test** a malformed data URL yields a clear error, not `undefined`
- [ ] **Step 2: Implement** an explicit `indexOf(",")` check before slicing
- [ ] **Step 3: Verify** the 8 existing readImage tests stay green

---

# PI-7 — Pluggable AI provider

### Task 11: Extract the provider contract

**Files:** Create `cf-worker/providers/index.js`, `cf-worker/providers/gemini.js`, `cf-worker/schema.js`; modify `cf-worker/image-reader.js`

**Interfaces:**
- `read(imageBase64, mimeType, env) → { items, detail }` — **never throws**; failure is `items: []` with `detail` set
- `pickProvider(env)` → provider module, defaulting to `gemini`

- [ ] **Step 1:** Move today's Flash → Pro logic into `providers/gemini.js` **unchanged**. This is a pure move
- [ ] **Step 2:** All 25 worker tests must pass with **zero edits to their assertions**. If a test needs changing, the move was not pure
- [ ] **Step 3: Verify** green

### Task 12: OpenRouter provider

**Files:** Create `cf-worker/providers/openrouter.js`, `cf-worker/providers/openrouter.test.js`

- [ ] **Step 1: Test** with `fetch` stubbed — request carries the model, a base64 image part and a JSON response format; a malformed reply yields `items: []`, never a throw; HTTP 429 is reported in `detail`
- [ ] **Step 2: Implement** against `POST https://openrouter.ai/api/v1/chat/completions`, model from `OPENROUTER_MODEL` (default `qwen/qwen3.7-flash`)
- [ ] **Step 3: Verify** tests green

### Task 13: Env switch + docs

**Files:** Modify `cf-worker/wrangler.toml`, `.env.example`, `CLAUDE.md`, `HUMAN-TASKS.md`

- [ ] **Step 1:** `AI_PROVIDER` selects the provider; unknown value falls back to `gemini` **and logs a warn** — never fails the request
- [ ] **Step 2:** Document `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` as `wrangler secret put`, and add getting an OpenRouter key to `HUMAN-TASKS.md`
- [ ] **Step 3: Verify** tests green; state plainly in the commit that **no provider change is live until the worker is deployed**

---

# PI-8 — Multi-page slips

### Task 14: Merge helper (pure, testable)

**Files:** Create `src/parse/mergePages.ts`, `src/parse/mergePages.test.ts`

**Interfaces:** `mergePages(pages: PageResult[]): { items: TaggedItem[]; failed: number[] }`

- [ ] **Step 1: Test** — order preserved across pages; each item carries its 1-based page; a failed page appears in `failed` and does not lose the others
- [ ] **Step 2: Implement**
- [ ] **Step 3: Verify** tests green

### Task 15: Multi-select and sequential reads

**Files:** Modify `src/ImageReader.tsx`, `src/ImageReader.css`, `src/readImage.ts`

- [ ] **Step 1:** Add `multiple` to the file input; keep the camera path single-shot
- [ ] **Step 2:** Read pages **sequentially** (spec §5.2 — never batch into one request), showing "Reading page 2 of 3…"
- [ ] **Step 3:** Render the merged confirm list with a page badge per row, and an inline "page N could not be read — retry" row for failures
- [ ] **Step 4: Verify** — component behaviour cannot be unit-tested here. Drive it manually and **report it as a manual check**

---

## Definition of done

- [ ] `npm test` green (expect ~104 + ~40 new)
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] `CLAUDE.md` updated — PI-5→8 moved into **WHAT IS DONE** with how each item was verified, in the same commit as the code
- [ ] `DESIGN.md` updated where the system shape changed (new `src/log/`, worker provider split)
- [ ] Manual checks reported honestly as manual — never dressed up as tests
