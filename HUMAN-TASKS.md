# Human tasks — things code cannot finish

Everything in this file is blocked on a person: a console login, a repo
permission, a photo of a piece of paper, or Dad's actual phone. None of it can
be done from a checkout, which is why it is here and not in the PI plan.

*Written 2026-08-07, standing instruction added 2026-08-10. Companion to
`CLAUDE.md` — that file is the plan, this file is the queue of things only a
human can clear.*

**Ordered by what unblocks the most.** Item 1 gates everything that reaches Dad
through the website. Item 2 reaches him without item 1.

> ## Standing instruction — Siva, 2026-08-10, sharpened 2026-08-12
>
> **This file is the PRODUCTION HANDOVER queue, and it is drained last.**
> Most of it is Siva's colleague's job, not ours: deploying, the Firebase
> console, auth, production keys. Our job is to improve the features and prove
> they work, then hand over.
>
> **Nothing in here blocks feature work, and none of it is ever "the next
> thing".** If a task turns out to need a console login or a deploy, it lands
> here and the work continues around it.
>
> **For testing our own features, see [`TESTING.md`](TESTING.md)** — that is the
> near-term list, and the only things Siva personally needs to supply are a few
> photos and fifteen minutes at a microphone.
>
> The corollary still matters: **anything that can be built or checked without a
> human must be, immediately.** Several things that looked like they needed a
> person did not — offline behaviour, multi-page reading, log export and the
> add-customer race were all verified in a headless browser. Only genuine
> handwriting, a real voice, a physical phone and a console login are human.
>
> **Dad's own data is not our concern.** He manages his own customers and
> quotes. Throwaway `ZZ-` records in the live project are fine; do not build
> ceremony around avoiding them.

---

## 1. GitHub push access — Siva is handling this

- [ ] Get `RevanParimi` write access to `sivasanka1996/quoteapp`, or push from an
      account that has it.

**Status:** Siva is sorting this out with the repo owner; no action needed from
anyone else. Listed only because it explains why the two items below matter.

**What is stuck behind it:** `git push` to `origin` returns **403**. Work is
committed locally and going nowhere. `deploy.yml` triggers on push to `main`, so
**nothing on `feature/Vision_Draft` is live for Dad** — not PI-1 trust, not the
PI-2 quotation document, not the PI-3 client-side downscale. The branch is
several real improvements deep and Dad has none of them yet.

**Verify when cleared:** `git push` succeeds, then merge to `main` and watch the
Actions run go green through lint → test → build → deploy.

---

## 2. Deploy the Cloudflare Worker, then read one real slip

- [ ] `npx wrangler login` — **checked 2026-08-07: not authenticated on this
      machine.** It opens a browser for Cloudflare OAuth, so it needs a person.
- [ ] `cd cf-worker && npx wrangler deploy`
- [ ] Immediately after: open **https://quoteapp-3f48e.web.app** on a phone,
      photograph a real order slip, tap **📷 Read image**, confirm items come back.

**Do not use `wrangler deploy --temporary`.** `whoami` suggests it when you are
logged out, and it is wrong here: it deploys to a *temporary preview account*,
which does not touch the live
`quoteapp-image-reader.qouteappsub.workers.dev` that every build of the app
points at. You would get a green deploy and change nothing for Dad.

**This does not wait for item 1, and that is the whole point.** The worker
deploys by hand to one live URL that every build of the app already points at.
So this ships to Dad the moment it runs, from a feature branch, with no merge.
It is the one improvement available today.

**What it ships (four things now, all committed but dead in production):**
- PI-3: schema-constrained JSON output, Flash → Pro retry on a bad read, honest
  `confidence`.
- PI-4.2: the origin allowlist — right now the worker answers **anyone**, so the
  Gemini API key is a free relay for whoever reads the public repo.
- PI-5: one structured JSON log line per request — request id, provider, model,
  latency, item count — readable live with `npx wrangler tail`. Watch that while
  you take the first photo; it turns "it didn't work" into a specific line.
- PI-7: the provider split — **and a change of model**.
  [`config/app.config.ts`](config/app.config.ts) sets `ai.provider =
  "openrouter"`, so after this deploy slips are read by
  `qwen/qwen3.5-flash-02-23`, **not Gemini**. See §4a: this needs
  `OPENROUTER_API_KEY` set first, or every read fails with a clear message.
  To ship the other three things without the model change, set
  `ai.provider = "gemini"` in that file before deploying (or
  `AI_PROVIDER=gemini` in the Cloudflare dashboard, which needs no rebuild).

**Read this before you run it — no code here has ever met a real model API.**
Every worker test stubs `fetch`. The first genuine proof is that first photo.

**Then try a multi-page read (PI-8).** Photograph a two- or three-page order and
check the pages come back merged with `p1`/`p2` badges. The client half is
verified in a browser, but only against a faked proxy — no real model has read
page 3 of Dad's handwriting yet.

Three failures to tell apart on that first read:

| What you see | Cause | Fix |
|---|---|---|
| **403 Forbidden** | Origin allowlist rejected the app | Check the hostname is in `ALLOWED_ORIGINS`, [cf-worker/image-reader.js:16](cf-worker/image-reader.js#L16) — currently `quoteapp-3f48e.web.app`, `quoteapp-3f48e.firebaseapp.com`, `localhost:5173`, `localhost:4173` |
| **`OPENROUTER_API_KEY secret not set`** | §4a not done | `npx wrangler secret put OPENROUTER_API_KEY`, or set `AI_PROVIDER = "gemini"` |
| **Empty item list** | The model side, not origin | Check `npx wrangler tail` for the `model attempt` line — it names the model, the item count and the reason. Suspect the token ceiling (8192) on a long list |

**Test from the live site, not a file opened off disk** — a `file://` page sends
`Origin: null` and is refused by design.

**The app side is no longer a suspect.** On 2026-08-07 the ImageReader panel was
driven in a real browser with a faked proxy reply: the confirm list, the
qty/rate warning and the hand-off into the quote all render correctly on a
well-formed response (23 checks, see `CLAUDE.md`). So if that first real read
misbehaves, the fault is in the worker or in Gemini — not in the UI. That is the
whole point of having checked it beforehand.

**Revert if it goes wrong:** one line plus a redeploy. Low risk, but do it when
you can watch it, not right before Dad needs the app.

---

## 3. Add the `KEYSTORE_PASSWORD` secret

- [ ] GitHub → Settings → Secrets and variables → Actions → New repository secret
- [ ] Name `KEYSTORE_PASSWORD`, value `quoteapp123` (the current keystore password)

**What breaks without it:** the next APK build fails at
[build-apk.yml:51](.github/workflows/build-apk.yml#L51) with a message naming the
missing setting. Nothing else — the web app is unaffected.

**Be clear-eyed about what this fixes.** `quoteapp123` is in the public git
history permanently. Moving it to a secret stops *republishing* it; it does not
unpublish it. Actually retiring the password means a new keystore, therefore a
new signing key, and **Android will not install that over Dad's existing app** —
he would have to uninstall and reinstall, losing nothing but needing to be
present. Worth doing deliberately when he is around, never silently.

---

## 4. Get 2–3 photos of Dad's real order slips  ← *needed for PI-3 item 2*

- [ ] Photograph 2–3 slips Dad has actually written, the way he actually
      photographs them (his handwriting, his abbreviations, his layout)
- [ ] Hand them over; the code change afterwards is ~20 minutes

**No machine learning, no training, no new service.** This is worth stating
plainly because "few-shot" sounds like it implies a training pipeline. It does
not. Today the worker sends Gemini one request: *instructions + Dad's photo*.
Few-shot means sending *instructions + example photo + the correct answer for
that example + Dad's photo*. The examples are extra `inline_data` parts in the
same JSON request, added ahead of the real image in `readWith`. Gemini reads them
in-context and copies the pattern. No weights change, nothing is stored, nothing
is trained. Cost is a few extra tokens per read.

**Why it must be Dad's real slips:** the examples only help if they match what he
actually sends. Invented handwriting samples would show the model a pattern it
will never see again — measurably worse than including no example at all. That
is the entire reason this is blocked on a human instead of already done.

> **The same photos unblock the PI-7 provider comparison** (§4a below). Getting
> them is now the single highest-value human task in this file: it is the only
> thing standing between us and knowing which model reads Telugu best.

---

## 4a. Get an OpenRouter API key  ← *now ACTIVE — the worker is set to use it*

**Changed 2026-08-10 on Siva's call: `AI_PROVIDER = "openrouter"` is now set in
`cf-worker/wrangler.toml`.** Gemini is still the code-level fallback, so an
unknown provider or a deleted var lands back on it — but as configured, the next
deploy reads slips with **`qwen/qwen3.5-flash-02-23`**.

- [ ] Create an account at <https://openrouter.ai> and generate an API key
- [ ] Add credit — a few dollars covers many months at Dad's volume
- [ ] From `cf-worker/`: `npx wrangler secret put OPENROUTER_API_KEY`
- [ ] Deploy (§2), then read one real slip and watch `npx wrangler tail`

**Everything except the key is configured in one file:**
[`config/app.config.ts`](config/app.config.ts) — provider, model, token
ceiling, worker URL, allowed origins. Both the app and the Worker import it.
Change settings there, not in `wrangler.toml` or `.env`.

> ### The key does NOT go in `.env` or `.env.local`
>
> It would not work and it would leak. Those files build the **frontend**; the
> Worker is a different program on a different machine and never reads them.
> Anything Vite exposes is compiled into the public JS bundle, and this repo is
> public — which is the exact thing the Worker exists to prevent.
>
> `wrangler secret put` prompts for the value and stores it encrypted at
> Cloudflare. It never touches disk and is never committed.

**Without the key the read fails cleanly**, with `OPENROUTER_API_KEY secret not
set on this worker` — it does not silently fall back to Gemini. If you deploy
before adding the key, either add it or set `AI_PROVIDER = "gemini"`.

**Rollback is an env var, not a deploy.** Set `AI_PROVIDER = "gemini"` in the
Cloudflare dashboard and the very next request uses the old path. Same for
`OPENROUTER_MODEL` — trying a different model needs no build.

**A correction worth carrying:** the spec named `qwen/qwen3.7-flash`. **That
model does not exist.** The catalogue was re-fetched on 2026-08-10 and it is not
among the 207 models with vision *and* structured output — it would have failed
on the first real read. Verify any model id before setting it:

```bash
curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*"'
```

Cheapest viable options, checked live (all trivial at Dad's volume):

| Model | $/M in | $/M out | Note |
|---|---|---|---|
| `qwen/qwen3.5-flash-02-23` | 0.065 | 0.26 | **current pick** — cheapest Qwen with vision + structured output, 1M context |
| `qwen/qwen3.6-flash` | 0.188 | — | next rung if Telugu accuracy disappoints |
| `openai/gpt-5-nano` | 0.050 | 0.40 | cheaper in, dearer out, weaker multilingual |
| `google/gemini-2.5-flash` | 0.300 | 2.50 | same model we already call directly — no reason to pay a middleman for it |

**Cost is not what to judge this on.** A few reads a day costs cents a month
whichever wins. **Telugu accuracy on Dad's handwriting decides it**, and that
still needs §4's photos — nothing has yet compared these on real input.

---

## 5. On Dad's actual phone — before handover

None of this can be faked in a browser on a laptop.

- [ ] **Airplane-mode cold start.** Load the live site with signal, force-close
      it, turn on airplane mode, reopen. Customers and quotes must list.
      *This is the one PI-1 claim no automated check could reach* — it needs the
      service worker active, and the service worker never reaches `active` under
      Playwright. That is a known harness limitation, not a suspected bug.
- [ ] **Share a real PDF from a phone and open the file.** Turn all five columns
      on. Bug #8 was that the Amount column got clipped out of the *generated
      file* while the DOM looked perfect — every PI-2 check read the DOM, not the
      PDF. Only opening the actual file closes this.
- [ ] **Confirm the customer PDF hides cost and profit** before he sends one to a
      real customer.
- [ ] Walk him through the one-time camera and microphone permission prompts.
- [ ] General shakedown on his real phone and browser.

---

## 6. Firebase console — DO THIS LAST

**Deliberately ordered last** (Siva, 2026-08-07): finish everything buildable
before touching anything that needs a console. Both items below need a Firebase
login this machine does not have.

### 6a. PI-4.1 — single shared Google sign-in *(the final task in the plan)*

- [ ] Firebase console → Authentication → enable **Google** as a sign-in provider
- [ ] Only then: build the sign-in UI **and** change `firestore.rules` to
      `if request.auth != null`, and ship both together

**The order is not a preference, it is the whole risk.** `deploy.yml` deploys
`firestore:rules` automatically on every push to `main`. Committing
`if request.auth != null` before a working sign-in UI exists **locks Dad out of
every quote the moment that deploy lands.** Rules and client go out together,
verified together, or not at all.

**Why it can wait:** the Firebase config is committed in a public repo and the
rules are currently `allow read, write: if true`, so anyone who reads the repo
can reach the collections. For a two-user family app that is a **nuisance risk,
not a breach risk** — the standing call in `CLAUDE.md`, unchanged.

**When you do it, test this:** Firestore serves cached reads with a cached token,
but token *refresh* needs network. So the case to check is an airplane-mode cold
start after a long gap — auth is the one feature that can quietly undo PI-1's
offline story.

### 6b. Delete the stale composite index *(2 minutes, cosmetic)*

- [ ] Firebase console → Firestore → Indexes → delete the `customerId + updatedAt`
      composite index

It was removed from `firestore.indexes.json` in PI-4.5, but `firebase deploy`
never deletes indexes it no longer sees, so it still exists in the console.
`useQuotes` issues one equality filter and sorts client-side, so nothing queries
it. Costs a little storage and nothing else. Housekeeping only.

---

## 7. ~~One decision for Siva~~ — DONE 2026-08-07

- [x] Bump CI off Node 20 → **Node 22**

[deploy.yml:17](.github/workflows/deploy.yml#L17) now pins `node-version: 22`.
Node 20 reached end-of-life in April 2026, so CI was building what Dad runs on an
unmaintained runtime. Nothing was broken — 20.19.x satisfied the `engines` range
— but 22 is current LTS, supported into 2027, and already inside that range.

**Watch the first Actions run after this reaches `main`.** It is the first build
on 22, and CI is the only place it runs. Nothing here can prove that: deploys
only happen from `main`, and this is a feature branch.

---

## Not blocked on anyone — here so nothing looks lost

- **Bug #9** (open, low value): quotes saved *before* PI-2 that have a fractional
  quantity can show a stale `totalSale` in the quote list and home tiles. The
  editor and the customer document always recompute from stored `lines`, so both
  already read correctly, and opening + saving such a quote heals it permanently.
  Self-healing and only ever in the direction of correctness — not worth a
  migration for a handful of quotes.
- **Customer editing — built 2026-08-08, nothing pending.** Raised here on
  2026-08-07 as needing a decision from Siva; he said go ahead, and the
  edit-only half shipped (pencil on the customer screen; a corrected phone
  number also fixes quotations already saved). Verified in a real browser — see
  **Customer editing** in `CLAUDE.md`. **Delete** is still deliberately absent
  and needs no decision until Dad asks for it; the reasoning is under KNOWN
  GAPS. Left here only so the earlier note does not read as still open.
- **PI-3 item 6** (voice): keep the browser Web Speech API. Free, shipped, good
  enough. Only revisit — AI4Bharat IndicWhisper is the best fit — if Dad
  complains about Telugu accuracy. No work pending.
