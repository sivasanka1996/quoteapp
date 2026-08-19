# PI-1 → PI-4 and customer editing — verification record

Evidence tables moved out of `CLAUDE.md` on 2026-08-19 so the file it is
split from stays cheap to load every session. **Nothing here was edited** —
these are the original records, with their original wording and caveats.

Covers PI-1 (Trust), PI-2 (The document), PI-3 (Sharpen the AI paths),
PI-4 (Hygiene), and the customer-editing sheet.

> Moved from `CLAUDE.md`, which remains the plan, the decisions and the
> current state. This file is the evidence behind the "DONE" claims there.
> See [`CLAUDE.md`](../../CLAUDE.md) and [`DESIGN.md`](../../DESIGN.md).

---

### PI-1 — Trust — DONE and VERIFIED 2026-08-05

All six items shipped and were verified by driving the **built** app in
Chromium (Playwright, against the real Firestore project). One item is
partially verified — see the note under the table.

| Item | How it was verified | Result |
|---|---|---|
| Offline persistence — reads | `firestore/[DEFAULT]/quoteapp-3f48e/main` present in IndexedDB. Firestore blocked at the network layer, page reloaded: all 6 customers and all 4 stat tiles still rendered from cache. | **PASS** |
| Offline persistence — writes | Saved a quote with Firestore blocked, then restored the network. A separate Node client then found the quote on the **server** (2 lines, totalSale ₹2000) — the queued write really did drain. | **PASS** |
| Save never hangs | With Firestore blocked, Save went to "Saved ✓" in **2560ms** (the `ACK_TIMEOUT_MS` path) and showed the "will sync when you are back online" note. Never stuck on "Saving…". | **PASS** |
| `nextId` collision | 6 `seedNextId` unit tests, plus end-to-end: reopened a saved quote and tapped Add Item — row count went 1 → 2, no duplicate. | **PASS** |
| Unsaved-changes guard | Back straight after saving → no prompt. Edit the quote name, then Back → prompt appears. | **PASS** |
| Error boundary | Put a `throw` in `HomeScreen`'s render and rebuilt: got the recovery card ("Something went wrong" + Back/Reload), root HTML 498 bytes, not a blank page. Throw removed and rebuilt clean. | **PASS** |
| No-cost warning | 5 `hasNoCost` unit tests, plus end-to-end on an item with a sell rate and no cost: cost-side ₹0 warning, `no cost` row chip, and the profit panel reading "1 item has no cost entered… this profit is overstated". | **PASS** |

**Scope of "offline" above: the data layer only.** Each check aborted requests
to the app's single off-localhost endpoint —
`POST firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel`,
the WebChannel stream `onSnapshot` runs on. `localhost` stayed reachable, so
the app shell always loaded from the server. Whether the *service worker*
serves the shell with the network fully cut is untested: the SW never reaches
`active` under Playwright (headed or headless), and that is the harness, not
the build — `sw.js` is served as `text/javascript` and all 25 precache URLs
return 200. Deferred to the pre-handover list; it is pre-existing PWA
behaviour, not something PI-1 touched.

Tests are `environment: 'node'`, so anything touching the DOM needs a jsdom
switch in `vite.config.ts` first. Do not add a half-configured test setup just to
claim coverage — a manual check honestly reported is better than a fake test.
**Superseded by PI-12** (below): a second `dom` project now exists for exactly
this, so the switch this paragraph describes is no longer what a component
test needs — this is history, not current instruction.

**How to re-run these checks.** They are not in the repo (they need Playwright,
a Chromium download and a live Firestore). Recipe: `npm run build && npm run
preview`, drive `localhost:4173` with Playwright, abort `**://*.googleapis.com/**`
to simulate no signal, and use an obviously-named throwaway customer. Delete the
customer **and its quotes** afterwards — bug #6 means deleting the customer
alone leaves the quotes behind.

**Design note on the save path.** Firestore resolves a write promise only on
*server* ack. Offline that promise never settles, so simply awaiting it would
still hang the button even with persistence on — the original bug wearing a new
hat. `useQuotes.saveQuote` therefore races the write against a 2.5s
`ACK_TIMEOUT_MS` and returns `{ id, queued }`: `queued: true` means the
persistent cache has the data and the server has not confirmed yet, which the
editor reports as saved plus a "will sync" note. New quotes use a client-minted
`doc()` id rather than `addDoc`, so a quote created with no signal still gets a
stable id. Real failures (permission denied) still reject and surface as the
retry banner.

### PI-2 — The document — DONE and VERIFIED 2026-08-06

All five items shipped. Verified by driving the **built** app in Chromium
(Playwright, against the real Firestore project) with two obviously-named
throwaway customers, both deleted afterwards along with their quotes. 33 checks,
all passing.

| Item | How it was verified | Result |
|---|---|---|
| Customer name, address, phone | Seeded a customer with all three; the To block rendered each one. A second customer with no address or phone rendered no empty `.cv-billto-line` at all. | **PASS** |
| Date + quote number | Seeded `createdAt` = 06 Aug 2026 14:23; the document read `Q-260806-1423` and `06 Aug 2026`. | **PASS** |
| Number matches before and after the first save | New quote → Customer view **without saving** → `Q-260806-1234`. Back, Save, Customer view again → identical. Closed and reopened from the customer's history → still identical. | **PASS** |
| Validity + terms | Set in company settings with a multi-line terms block; both printed under the totals and the terms kept all 3 lines (`white-space: pre-line`). Cleared → the whole block disappeared. | **PASS** |
| Consistent `₹` | Every money cell and all three totals: `₹120`, `₹2,280`, `₹2,400`, `₹432`, `₹2,832`. | **PASS** |
| Fractional quantities (bug #5) | 2.5 m at ₹48: business row `2.5 × 48.00`, amount `120` — not `96`. Document showed qty `2.5` and `₹120`. | **PASS** |
| Nothing renders as `undefined` | Full document and bare document both scanned for `undefined` / `NaN` / `[object` — clean. | **PASS** |
| Header does not overflow a phone | At 375px the No./Date column wraps below the title (`flex-wrap: wrap`), the row does not overflow (scroll 291 = client 291) and the page does not scroll horizontally. | **PASS** |

**Two defects the whole-branch review caught, both fixed before merge.** Neither
was visible to a single task's review — each needed two tasks side by side.

1. **`Subject: Untitled` on the customer's document.** `saveQuote` had always
   stored `name.trim() || "Untitled"` as an internal placeholder, which was
   harmless while the quote name only fed the PDF *filename*. PI-2 promoted it
   to a rendered `Subject:` line, so reopening an unnamed quote and sharing it
   sent the customer a quotation reading "Subject: Untitled". `saveQuote` now
   stores the name as typed, each display site applies its own fallback, and the
   editor treats a stored `"Untitled"` as no name so quotes saved before the fix
   are covered too. The quote *list* still shows "Untitled", which is where that
   label belongs.
2. **The image and voice confirm-list qty and rate fields could not take a
   decimal point.** Both were controlled by a *number* and re-parsed on every
   keystroke, so React restored the committed value and erased the in-progress
   `"2."` — typing `2.5` produced **25**, and on the rate field `12.5` produced
   **125**. They now hold the in-progress text as a string and parse once at
   commit, matching what the quote editor's own qty field already did. Task 2
   had given these fields `inputMode="decimal"`, so the keypad was offering a
   key the field rejected.

Re-verified in the browser after those fixes: a legacy `"Untitled"` quote prints
no subject line and the word appears nowhere on the document, a named quote
still prints its subject, and the quote list still labels unnamed quotes.

**The document does not reflow, and that is deliberate** (this closed bug #8).
`sharePdf` rasterises `.cv-doc` with html2canvas at whatever width it happens to
be rendered at, so a responsive document meant *the file a customer received
depended on the screen it was shared from* — on a phone the item table
overflowed and the Amount column was cut out of the PDF entirely. `.cv-doc` is
now pinned to `width: 760px` on screen, so the shared file is identical from a
phone or a desktop; verified at 360, 375, 414, 820 and 1280px, all rendering
760px with nothing outside the captured node.

The cost is that the preview scrolls sideways on a phone — Dad sees the left of
the document and swipes for the totals. That is the right trade: a preview that
fits the screen but misrepresents the output is worse than one he has to nudge,
and every other PDF on a phone behaves this way. The `flex-wrap` on `.cv-docmeta`
is now dead weight at a fixed width; it is left as insurance.

Do not make the document responsive again without re-reading this. If the
preview needs to fit a phone screen, scale it (`transform`) rather than reflow
it — and check what html2canvas does with the transform before trusting it.

**The business view deliberately has no `₹`.** PI-2 item 4 scoped the symbol to
the home tiles and the customer-facing document. The editor's own dense number
columns were left alone.

**Bug #5's closure is precise.** The named mechanism — `parseInt(l.qty)` in five
places — is gone, replaced by one tested `parseQty` in `types.ts`. The *voice*
path still reads a leading decimal as part of the item name, and that is
deliberate: in this domain "1.5 sq" and "2.5 sq" are item names, and the idiom is
quantity-first-as-a-whole-number — the existing test
`parseTranscript("6 wire 1.5sq rate 1650")` expects qty 6, name "wire 1.5sq".
Teaching that regex decimals would parse "2.5 sq wire" as qty 2.5 of "sq wire",
turning a correct parse into a wrong one. A fractional quantity from a voice
import is entered by editing the qty field afterwards, which now works.

**What this did not check:** the actual generated PDF. Every check reads the DOM
that `sharePdf` rasterises, not the file html2canvas produces. That gap is how
bug #8 above stayed invisible until the table was measured — worth remembering
before trusting a DOM check to speak for the PDF.

### PI-3 — Sharpen the AI paths — 5 of 7 DONE 2026-08-07, NOT DEPLOYED

**Decision, 2026-08-05, unchanged: do not switch models, and do not add
embeddings or a vector DB.** Gemini 2.5 Flash is the right tier for this. The
weak link was the prompt layer, not the model.

| Item | How it was verified | Result |
|---|---|---|
| 1. Structured output — `responseMimeType` + `responseSchema` replace the ```json fence hunt | 16 worker unit tests with `globalThis.fetch` stubbed: the request carries `responseMimeType: "application/json"` and a schema with name/qty/rate; a blank name is dropped; a missing rate stays `null` rather than becoming 0. Field names and the uppercase `Type` enum checked against Google's `generateContent` API reference. | **PASS (no live API call)** |
| 3. Downscale before upload | Real Chromium against the dev server, calling the app's own `prepareImage`. A 4000×3000 photo (6155 KB) uploaded as 646 KB of base64 at exactly 1600×1200; an 800×600 photo was left at 800×600, not enlarged. | **PASS** |
| 4. Escalate on retry only | Unit tests: Pro is not called when Flash reads the list; Flash returning zero items, HTTP 429, or a thrown request each escalate to `gemini-2.5-pro`; Pro is tried once, never in a loop. | **PASS (no live API call)** |
| 5. Honest offline message | Real Chromium with `context.setOffline(true)`: `readImageItems` rejects with "No internet connection — reading a photo needs one", not the configuration error and not a bare `TypeError`. | **PASS** |
| 7. `confidence` made honest | Unit tests: `"full"` only when every row has a qty **and** a rate, `"partial"` when a rate or qty is missing, `"low"` when nothing was read. | **PASS** |

**Item 2 (few-shot examples) is the one thing still open, and it is blocked on
Siva, not on code.** Tracked in [`HUMAN-TASKS.md`](../../HUMAN-TASKS.md) §4. It needs
two or three photos of Dad's *actual* order slips to paste into the prompt. Get
the photos, then add them as `inline_data` parts ahead of the real image in
`readWith`.

**No training and no ML are involved, despite how "few-shot" sounds.** The
request today is *instructions + Dad's photo*; few-shot makes it *instructions +
example photo + that example's correct answer + Dad's photo*, all in the same
JSON body. Gemini copies the pattern in-context. No weights change, nothing is
stored, nothing is fine-tuned — the cost is a few extra tokens per read. The
examples must be Dad's real slips because they only help if they match what he
actually sends; invented handwriting shows the model a pattern it will never see
again, which is worse than no example at all.

**None of the worker half is live** — and PI-4.2's origin allowlist has since
landed on the same undeployed file, so one `wrangler deploy` now ships both.
`cf-worker/image-reader.js` is committed but not deployed — deploying needs
`npx wrangler deploy` from `cf-worker/`, and per the Deploy section that takes
effect for Dad immediately, independent of this branch. The client half (downscale, offline message) ships normally with
`main`. The two halves are independent: an old worker handles a downscaled
image fine, and a new worker handles a full-size one fine, so they can go out
in either order.

**What this did not check: any of it against the real Gemini API.** Every worker
test stubs `fetch`, so no request built by this code has ever received a real
200. The schema is right per Google's published reference, but the first real
proof will be the first photo read after deploy — read one before assuming it
works. Two specific things to watch on that first read:

- `maxOutputTokens` is still 8192 and thinking tokens count against it on the
  2.5 models. It was left alone deliberately: that limit is what the live worker
  runs today, so it is known to be survivable for Dad's slips, and changing it
  blind is a worse bet than leaving it. If long lists come back empty, this is
  the first suspect.
- The Pro retry doubles the worst-case wait on a bad read. It only fires when
  Flash already returned nothing, so the average read is unchanged.

The ImageReader panel also grew an offline banner and a "N items still need a
qty or rate — fill it in here, or the line is added at ₹0" warning on the
confirm list. That warning closes a real gap: a null rate becomes a blank
`sellRate`, and PI-1's existing no-cost warning only covers the *cost* side, so
nothing used to catch a sell-side ₹0.

**Both of those UI pieces are now verified — 2026-08-07, 23 checks, all
passing.** They were the last "never rendered" claim in the code. Driven in
Chromium against the built app and the real Firestore, with **only the Gemini
proxy intercepted at the network layer** — so the component, `readImageItems`,
and the whole client path are the real ones, and no worker deploy or API key was
needed. One throwaway customer per run, deleted afterwards; Save was never
pressed, so no quote document was ever written.

| Item | How it was verified | Result |
|---|---|---|
| Offline banner | Absent while online; `context.setOffline(true)` made `.ir-offline` appear reading "No internet connection… the rest of the app keeps working offline"; going back online cleared it. | **PASS** |
| Incomplete-row warning | A canned 3-item read (one complete, one with `rate: null`, one with `qty: 0`) produced "**2 items still need** a qty or rate — fill **them** in here, or the line is added at ₹0". | **PASS** |
| Warning counts *and* grammar | Filling the missing rate dropped it to "**1 item still needs** … fill **it** in here" — the singular branch renders correctly. Filling the zero qty removed the warning entirely. | **PASS** |
| Both conditions counted | A missing rate and a zero qty each count, confirming the `_rateRaw === "" \|\| !(parseQty(_qtyRaw) > 0)` pair. | **PASS** |
| Decimal entry (PI-2 regression) | Typed `2.5` into qty and `12.5` into rate keystroke-by-keystroke; fields held `"2.5"` and `"12.5"`, not `25` and `125`. | **PASS** |
| Values reach the quote | The row rendered `2.5 × 12.50` and an amount of `31` — so the fraction really multiplied. Checked on the row's own cell, **not** a page-text search for "2.5", which the item name "Copper Wire 2.5sq" would have satisfied on its own. | **PASS** |
| Checkbox count | "Add 3 items to quote" → unchecking a row → "Add 2 items to quote". | **PASS** |
| Clean render | All three names carried into the editor; no `undefined`/`NaN`/`[object`; no uncaught page errors. | **PASS** |

**What this still does not check:** the real Gemini response. The proxy was
faked, so this proves the *panel* handles a well-formed reply correctly — it says
nothing about what Gemini actually returns. That gap closes only on the first
real read after the worker is deployed. The harness is not in the repo (it needs
Playwright and a live Firestore); recipe is the same as PI-1's, plus
`page.route(PROXY_URL, …)` to serve the canned items.

6. Keep the browser Web Speech API for voice — free, shipped, good enough. Only
   revisit (AI4Bharat IndicWhisper is the best fit) if Dad complains about
   Telugu accuracy. **No work needed; nothing was changed here.**

**The VoiceReader panel is now verified too — 2026-08-07, 26 checks, all
passing.** It had the same gap ImageReader did: `voiceParse` was unit-tested,
the panel around it had never been drawn. The Web Speech API does not exist in
headless Chromium, so `window.SpeechRecognition` was replaced with a mock that
fires `onresult`/`onerror`/`onend` on command — the component, `parseTranscript`
and the confirm path are all real, only the recognition engine is faked.

| Item | How it was verified | Result |
|---|---|---|
| Language toggle | English active by default with the English example; picking తెలుగు flipped `aria-pressed`, switched the example and hint to Telugu script, and wrote `te-IN` to `quoteapp.voiceLang`. | **PASS** |
| Language persists | Closed and reopened the panel — still Telugu, since the choice is read from localStorage on mount. | **PASS** |
| `stageRef` guard, both directions | Recognition ending *while listening* returned the panel to idle rather than leaving it stuck on "Listening…" — the exact regression the ref exists to prevent. Ending *after* a result left the confirm screen intact. | **PASS** |
| Error branches | `no-speech` → "No speech detected"; `not-allowed` → "Microphone permission denied". Each renders its own message, not the generic one. | **PASS** |
| Alternatives | Three alternatives came back; the top one showed as "I heard", and exactly the other two rendered as chips. Picking one replaced the transcript **and** re-parsed name/qty/rate from it. | **PASS** |
| Parse into fields | `"6 wire 1.5sq rate 1650"` filled name `wire 1.5sq`, qty `6`, rate `1650` — the quantity-first idiom bug #5's closure note describes, working in the UI. | **PASS** |
| Decimal entry | Typed `2.5` and `12.5`; fields held them, and the resulting quote row read `2.5 × 12.50` with an amount of `31`. | **PASS** |
| Add gating | Disabled with an empty name, re-enabled once one is typed. | **PASS** |

Same harness caveats as the ImageReader run: not in the repo, one throwaway
customer per run deleted afterwards, Save never pressed. And the same limit —
this proves the panel handles well-formed recognition results, not that Chrome's
recogniser hears Dad's Telugu correctly. Only he can tell you that.

### PI-4 — Hygiene — 7 of 8 DONE 2026-08-07

Everything here is done except **PI-4.1**, which needs Firebase console access.

| Item | How it was verified | Result |
|---|---|---|
| 2. Worker answers only the app | 9 new worker tests: the app origin and both localhost ports are reflected back by name; an unknown origin gets 403 and Gemini is never called; a request with **no** Origin gets 403 too; a refused origin is never reflected; `/list` is behind the same check; `Vary: Origin` is set. | **PASS (no live API call)** |
| 3. Dead code deleted | `QuoteDrawer.tsx/css` and `useQuoteStorage.ts` imported by nothing but each other, confirmed by grep across `src/`. Lint and build clean afterwards. | **PASS** |
| 4. Cascade quote deletion (bug #6) | `scripts/cascade-check.ts` against the **real** Firestore. Against the old code: "2 orphan(s) left behind", 3 of 6 checks failed. Against the fix: all 6 pass — victim's quotes gone, bystander's customer and quote untouched. | **PASS (live Firestore)** |
| 5. Stale index dropped | `useQuotes` issues one equality filter and sorts client-side, so no composite index applies. | **PASS** |
| 6. Version drift | Releases API says latest is v1.4 and `APK_URL` already pointed there. Relabelled rather than "fixed" — see the note under Live URLs. | **PASS** |
| 7. Lint in CI | Ran `npm run lint` clean before wiring it into `deploy.yml`, so it cannot fail the first deploy that hits it. Its reach was widened on 2026-08-07: the only config block matched `**/*.{ts,tsx}`, so the gate walked `cf-worker/image-reader.js`, its test and `eslint.config.js` with no rules at all. Separate blocks now lint them under `globals.serviceworker` and `globals.node`. | **PASS** |
| 10. Keystore password | Gradle reads `KEYSTORE_PASSWORD` from the environment; a missing value fails with a message naming the setting. | **PASS (not run — workflow_dispatch only)** |
| 8, 9. README, `.env.example` | Were already done; the list was stale. | — |

**Two things need a human before the next APK build or worker deploy:**

- **Add a `KEYSTORE_PASSWORD` secret** (Settings → Secrets and variables →
  Actions) with the current value, or the next APK build fails with the
  message above. `quoteapp123` is in the public git history for good — moving
  it out stops republishing it, it does not unpublish it. Actually retiring it
  means a new keystore and therefore a new signing key, which Android will not
  install over the existing app: Dad would have to uninstall and reinstall.
  Worth doing when he is around, not silently.
- **The worker allowlist is not deployed.** `npx wrangler deploy` from
  `cf-worker/` takes effect for Dad immediately. Read a real photo straight
  after. If it fails, this is the first suspect and the revert is one line
  plus a redeploy.

**1. Single shared Google sign-in + `if request.auth != null` — MOVED TO LAST,
2026-08-07.** Siva's call: "can't we put the firebase at the end of all the
tasks, we need to finish things before checking these." It is no longer item 1
of PI-4 — it is **the final task in the whole plan**, after every other PI item
is genuinely done. Reason to reorder: it was the only console-gated item sitting
at the top of a list of buildable work, so it kept reading as the next thing up
and stalling progress reports on a blocker nobody here could clear. It is also
the item this file has always called a *nuisance* risk, not a breach risk.

Do not raise it as "next" until everything else is finished. Two hard blockers,
neither of them code:

- Enabling Google as a sign-in provider is a Firebase **console** action. There
  is no console access here, and half-built auth is worse than none.
- `deploy.yml` deploys `firestore:rules` automatically on every push to `main`.
  Committing `if request.auth != null` before a working sign-in UI exists would
  **lock Dad out of every quote the moment that deploy lands**. The rules and
  the client have to go out together, verified together.

When it is done, check what auth does to PI-1's offline story: Firestore serves
cached reads with a cached token, but token *refresh* needs network, so an
airplane-mode cold start after a long gap is the case to test. Until then this
stays what CLAUDE.md has always called it — a nuisance risk, not a breach risk,
and never a blocker.

### Customer editing — DONE and VERIFIED 2026-08-08

Not a PI item — it came out of the pre-merge whole-branch review, which found
that `updateCustomer` had never had a call site. Verified by driving the
**built** app in Chromium (Playwright, real Firestore) at 390px, with one
`ZZ-edit-check-*` customer deleted afterwards along with its quotes. 21 checks,
all passing, plus 8 unit tests on `customerPatch`.

| Item | How it was verified | Result |
|---|---|---|
| Sheet opens on stored values | Seeded a customer through the UI, tapped the pencil: all three fields prefilled from the record. | **PASS** |
| Reopening discards a cancelled draft | Typed into phone, hit Cancel, reopened — the stored phone was back, not the abandoned text. | **PASS** |
| Save gated on a name | Blanked the name → Save disabled; typed one back → enabled. `customerPatch` returns null for a blank name as the guard behind that. | **PASS** |
| The edit lands on screen | Changed the phone and saved: the header contact line showed the new number and not the old one. | **PASS** |
| Padded input is trimmed | Entered `"  Miyapur "`; the header rendered `· Miyapur`. These fields print on a customer's PDF, where a stray space shows. | **PASS** |
| A no-op save just closes | Reopened and saved with nothing changed — sheet closed, no write, values intact. | **PASS** |
| **The correction reaches a quotation** | Opened a new quote → Customer view: the To block carried the new phone **and** the new address, and neither old value appeared anywhere in the document. | **PASS** |
| Nothing renders broken | Document scanned for `undefined` / `NaN` / `[object`; no uncaught page errors for the whole run. | **PASS** |

**The write is deliberately not awaited, and that is PI-1's lesson reused.**
Firestore resolves a write only on *server* ack, so `await updateDoc(...)` would
have hung the Save button forever with no signal — the same defect `saveQuote`
needed `ACK_TIMEOUT_MS` to dodge. This path needs no ack race because it makes
no promise worth racing: nothing tells Dad his data is safe, the sheet just
closes and the screen shows what he typed. The persistent cache holds the write
and replays it. A genuine rejection — rules refusing us once PI-4.1 lands —
reverts the screen to the stored values and shows a banner, so the UI never
displays a number Firestore rejected.

**Why the change had to travel up to the router.**
[AppRouter.tsx:17](../../src/AppRouter.tsx#L17) keeps the selected customer as a
snapshot in its own state and nothing re-reads it, so writing to Firestore alone
would have left Dad staring at the number he had just corrected. `CustomerScreen`
takes an `onCustomerChange` callback and the router replaces the screen's
customer with it. That is also why the fix is retroactive: `QuoteEditor` reads
the customer from that same object.

**What this did not check:** the generated PDF, same gap as PI-2 — every check
reads the DOM that `sharePdf` rasterises. And the harness is not in the repo (it
needs Playwright and live Firestore); recipe is PI-1's, plus a
`ZZ-edit-check-*` customer and a cascade delete afterwards, since there is still
no delete button in the UI.
