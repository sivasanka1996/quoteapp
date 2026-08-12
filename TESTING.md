# Feature testing — what Siva provides, what the agent does

*Written 2026-08-12. Companion to [`CLAUDE.md`](CLAUDE.md) (the plan) and
[`HUMAN-TASKS.md`](HUMAN-TASKS.md) (production handover, which is somebody
else's job and happens last).*

---

## Scope — read this first

**This file is about testing OUR features with DUMMY data.** It is not about
production, not about Dad's real quotes, and not about deployment.

- **Dad's own data is Dad's problem.** He manages his own customers and quotes.
  Nothing here needs to protect it, and no check needs to avoid it. Throwaway
  `ZZ-` records in the live Firestore are fine — delete them when convenient,
  and do not build ceremony around it.
- **Deployment, Firebase console, auth, API keys in production** — all handled
  by Siva's colleague at handover, at the very end. See `HUMAN-TASKS.md`. Do
  not treat any of it as a blocker on feature work.
- **Our job:** make the features work and prove they work, then hand over.

The local Firestore emulator (`npm run emulators`) exists and is nice to have,
but it is **not a prerequisite for anything here**. If Java is not installed,
test against the live project with dummy records and move on.

---

## Already proved — do not redo

| Feature | How | Result |
|---|---|---|
| Calc engine, parsers, logger, merge | 222 unit tests | green |
| Multi-page reading, sequential + partial failure + retry | 18 browser checks, faked proxy | green |
| Log export, IndexedDB, `?debug=1` | 17 browser checks | green |
| Offline add-customer (bug #10) | 7 browser checks, red-then-green | green |
| Voice **parser** (`parseTranscript`) | 16 unit tests | green |
| Image **panel** (confirm list, warnings, decimals) | 23 browser checks, faked proxy | green |

**What all of that shares: no real model has ever been involved.** Every image
test stubs `fetch`; every voice test feeds a string straight to the parser.

---

## 1. The real AI read — ~~the biggest untested thing~~ DONE 2026-08-12

**Status: done. 30 checks passing against the live API, after two real defects
were found and fixed.** Full write-up in [`CLAUDE.md`](CLAUDE.md) under "The
real AI read". To re-run:

```bash
powershell -ExecutionPolicy Bypass -File scripts/make-mock-slips.ps1
npx vite-node scripts/openrouter-live-check.ts
```

**The API contract was correct first time** — model id, `response_format`
dialect, image part shape and base64 encoding all worked on the first 200. The
two things that were broken were worse than a broken contract, because neither
announces itself:

1. **Thinking tokens ate the reply.** `max_tokens` is one budget covering
   reasoning *and* content. The Telugu slip spent all 8192 on reasoning, took
   **70 seconds**, and returned nothing — which Dad sees as "could not read any
   items". Fixed with `reasoning: { enabled: false }`.
2. **The prompt told the model to divide.** The old rate instruction made both
   models read a lone price as a line total: "5 no 1650" came back as
   **₹330**. Three of five rows silently wrong by a plausible amount. Fixed by
   rewriting the rule; pinned by `cf-worker/schema.test.js`.

Every quantity and rate on both slips is now exact, in ~3s per page. Item
*names* in Telugu are the remaining weak spot (ఎంసిబి read as "Fan Switch") and
are reported as `NOTE` rather than `FAIL` — a wrong name is visible to Dad and
editable, a wrong number is not.

**Still unproven, and only §2 below can close it:** these slips are generated
from fonts. Nothing here says a model can read real handwriting.

**The Gemini fallback could not be tested** — `GEMINI_API_KEY` is empty in
`.env`. It shares the fixed prompt but still has the thinking-budget defect.

---

## 2. Image reading on real handwriting — needs Siva

**Siva provides: 3–5 photos.** They do not need to be Dad's. Siva writing an
order slip himself in the same style is enough to test the feature.

What makes them useful:

- [ ] **2–3 single-page slips**, handwritten, in the style Dad uses —
      item name, quantity, rate per line
- [ ] **At least one with Telugu item names**, since that is the thing most
      likely to break and the reason a multilingual model was chosen
- [ ] **One deliberately messy one** — slanted, poor light, a smudge. The
      failure path matters as much as the happy one
- [ ] **One multi-page order, 2–3 pages**, to exercise PI-8 end to end against
      a real model rather than a faked proxy
- [ ] Photographed the way it will really happen: phone camera, handheld,
      whatever light is around

**Where to put them:** a `fixtures/slips/` folder. It is gitignored — these are
photos, not source.

**What the agent does with them:** reads each through the real pipeline, reports
per-slip what came back versus what is written on the paper, and says plainly
which errors are the model's and which are ours.

---

## 3. Voice — needs Siva at a microphone

**This cannot be automated at all, and it is worth being blunt about why.**

Voice uses `window.SpeechRecognition`, the browser's own engine. No model of
ours is involved, the Worker is not in the path, and Gemini never sees audio.
So there is nothing to stub and nothing to fake — the only test is a human
speaking into a real microphone in Chrome.

**Setup:** `npm run dev`, open in **Chrome** (Web Speech does not exist in
Firefox), allow the microphone, open a quote, tap **Add by Voice**.

**Siva provides: say each line below and record two things** — the transcript
the app shows under "I heard", and the name / qty / rate it fills in.

### English (`en-IN`)

| Say this | Expected qty | Expected name | Expected rate |
|---|---|---|---|
| "six wire rate 1650" | 6 | wire | 1650 |
| "wire 6 nos rate 1650" | 6 | wire | 1650 |
| "twenty five wire rate 1650" | 25 | wire | 1650 |
| "2 wire code 4402" | 2 | wire code 4402 | *(blank)* |
| "6 wire 1.5sq rate 1650" | 6 | wire 1.5sq | 1650 |
| "4 MCB 32 amp 450" | 4 | MCB 32 amp | 450 |
| "2 cable rs 12,500" | 2 | cable | 12500 |
| "conduit pipe" | 1 | conduit pipe | *(blank)* |

### Telugu (`te-IN`) — tap the తెలుగు toggle first

| Say this | Expected qty | Expected name | Expected rate |
|---|---|---|---|
| "ఐదు వైర్ రేటు 1650" | 5 | వైర్ | 1650 |
| "మూడు స్విచ్ ధర 240" | 3 | స్విచ్ | 240 |
| "ఇరవై వైర్ రేటు 1650" | 20 | వైర్ | 1650 |
| "పది ఎంసిబి రేటు 450" | 10 | ఎంసిబి | 450 |

### What to report back

For each line, three things:

1. **What you said**
2. **What "I heard" showed** — the raw transcript
3. **What landed in the fields** — name, qty, rate

That split is the whole point. If the transcript is wrong, the browser
misheard and `voiceParse` is blameless — nothing we can fix in this repo. If
the transcript is right but the fields are wrong, that is **ours** and it is a
parser bug we can fix the same day.

Also worth noting if it happens: the mic not being offered at all, "no speech
detected", or the panel getting stuck on "Listening…".

---

## 4. The generated PDF — automatable, not yet done

Every PI-2 check reads the **DOM** that `sharePdf` rasterises, never the file
it produces. That is exactly how bug #8 hid: with all five columns on, the
Amount column was clipped out of the shared PDF while the DOM looked perfect.

**Siva provides:** nothing.
**Agent does:** generate a real PDF headlessly and inspect the output file, at
phone width, with every column enabled.

---

## 5. Dummy data for general feature testing

The agent creates whatever it needs — customers named `ZZ-<what>-<timestamp>`,
quotes with a few lines. No approval needed, no cleanup ceremony. If a stray
`ZZ-` record survives a run it is noise, not damage.

`scripts/cascade-check.ts` shows how to remove a customer and their quotes
together if a tidy-up is wanted.

---

## Priority order

1. ~~**Real AI read**~~ — **DONE 2026-08-12**, two defects fixed (§1)
2. **PDF file check** — agent, unblocked now
3. **Photos** — Siva, ~15 minutes, unblocks real-handwriting and multi-page
4. **Voice script** — Siva, ~15 minutes at a mic, the only truly unautomatable one

Now that §1 is closed, **§2 and §3 are the whole remaining queue and both are
Siva's**. Nothing else in the plan is blocked on them.

Everything else in the plan is done. Production and auth are the colleague's,
at handover.
