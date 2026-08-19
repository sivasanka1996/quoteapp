# The live API reads, and the generated PDF — verification record

Evidence tables moved out of `CLAUDE.md` on 2026-08-19. **Nothing here was
edited.**

Covers the first real OpenRouter reads (2026-08-12), the round-two run
against real handwritten slips the same day, and the first inspection of
the actual generated PDF file rather than the DOM behind it.

> Moved from `CLAUDE.md`, which remains the plan, the decisions and the
> current state. This file is the evidence behind the "DONE" claims there.
> See [`CLAUDE.md`](../../CLAUDE.md) and [`DESIGN.md`](../../DESIGN.md).

---

### The real AI read — DONE and VERIFIED 2026-08-12

The biggest untested thing in the repo, closed. Every worker test stubs
`globalThis.fetch`, so the model id, the prompt, the `response_format` dialect
and the image encoding had never met the live API — and if any one of them were
wrong, **every read Dad ever attempted would fail**.

`scripts/openrouter-live-check.ts` now proves it end to end. It calls the real
`cf-worker/image-reader.js` default export with a real `Request`, so the origin
allowlist, `pickProvider`, the provider, `normalize` and `confidenceOf` are all
the shipping code. Nothing is stubbed but the transport into the Worker.
`scripts/make-mock-slips.ps1` generates the images (handwriting font for
English, Nirmala UI for Telugu, at the 1200×1600 / JPEG-q85 shape
`prepareImage` produces). Deliberately not a `*.test.ts`, like
`cascade-check.ts` — it spends money and CI must never run it.

```bash
powershell -ExecutionPolicy Bypass -File scripts/make-mock-slips.ps1
npx vite-node scripts/openrouter-live-check.ts
```

**The API contract was right first time.** Model id, `response_format:
json_schema` dialect, the `image_url` data-URL part, base64 with no prefix —
all correct, all confirmed by a 200. The two defects were subtler, and both
would have hurt Dad.

| Item | How it was verified | Result |
|---|---|---|
| **Defect 1 — thinking tokens ate the whole reply** | `max_tokens` is ONE budget covering reasoning *and* content. Reading the six-line English slip, qwen3.5-flash spent **5902 reasoning tokens** of 8192 and only just finished. The Telugu slip did not: `finish_reason: "length"` after **70 seconds**, empty content, which reaches Dad as "could not read any items from this photo". Fixed by sending `reasoning: { enabled: false }` — 232 completion tokens, 2.2s, ~8x cheaper. | **FIXED, verified live** |
| **Defect 2 — the prompt told the model to divide the rate** | The old wording ("if a line shows both a smaller and a larger number, the smaller one is usually the unit rate") made both models read a *lone* price as a line total. On the Telugu slip "5 no 1650" came back as **rate 330** (1650÷5) and "3 no 240" as **rate 80**. Three of five rows silently wrong, each by a plausible amount. Rewritten to state that one price IS the rate and must not be divided. | **FIXED, verified live** |
| Every quantity and rate, English slip | All 6 rows exact: 6×1650, 4×450, 25×95, 30×48, 12×125, 8×70. | **PASS (live API)** |
| Every quantity and rate, Telugu slip | All 5 rows exact: 5×1650, 3×240, 10×450, 20×48, 8×70. | **PASS (live API)** |
| The line-total trap | Row 3 reads "25 no 95 = 2375" on the paper. The model returns **95**, not 2375 — so the two-price half of the rule still works after the rewrite. | **PASS (live API)** |
| `confidence` is derived, on real data | `"full"` on both slips once every row had a qty and a rate; `"low"` on the failed control. PI-3.7's derived confidence, finally seen against a real response. | **PASS (live API)** |
| Origin allowlist, on the real path | A request with no Origin gets **403** and no API call is made. PI-4.2 exercised for real rather than against a stub. | **PASS** |
| **The check can fail** | Run first against a made-up model id: 0 items, `confidence: "low"`, detail naming HTTP 400. Run before trusting any green above. | **PASS (red control)** |

**Telugu item *names* are the weak spot, and they are graded separately on
purpose.** A wrong number is money Dad never sees; a wrong name sits in the
confirm list in front of him and he retypes it. On the mock slip qwen3.5-flash
rendered ఎంసిబి (MCB) as "Fan Switch 32A" and ఫ్యాన్ బాక్స్ as "Fan Hook".
Numbers were perfect. The script reports these as `NOTE`, not `FAIL`.

**A documentation error was found and corrected, and it is worth naming.** This
file and `openrouter.js` both asserted that `qwen/qwen3.7-flash` "does not
exist" with vision and structured output, citing a catalogue check. The
catalogue was re-fetched on 2026-08-12 — 406 entries — and **it is there**, takes
images, costs **half** the configured model ($0.030/M in vs $0.065), answered
slightly faster, and got the Telugu MCB row right where the incumbent did not.
The claim was simply wrong. **The model was not switched**: the decision is
locked to Dad's real handwriting, not a mock, and qwen3.7-flash advertises
`response_format` but *not* `structured_outputs`, so schema conformance may be
advisory rather than enforced there. Both questions the real slips answer.

### Round two — real handwritten slips, 2026-08-12

Siva supplied five images of handwritten order slips the same day: a flat
evenly-lit one, two handheld shots (shadow, creases, a hand in frame, the `3100`
smudged into ink blobs), a three-page order, and one with Telugu item names.
They run through `scripts/prepare-slips.ps1` first, which mimics `prepareImage`
— longest edge to 1600, JPEG q85 — so the model sees the bytes Dad's phone would
actually upload rather than a 3 MB PNG. That script also splits the three-page
photo into the three separate images PI-8 expects.

**106 checks, all passing.** But only after the rate defect came back.

| Item | How it was verified | Result |
|---|---|---|
| **Defect 2 was NOT fixed — it returned on real photographs** | The prompt rewritten earlier that day held on the font-rendered mocks and **failed on 2 of 6 real images**. On the crumpled shot every row came back divided: 1650÷10=**165**, 2450÷6=**408**, 3100÷4=**775**, 120÷12=**10**, 185÷8=**23**. Page 1 of the three-page order did the same. Reproduced deterministically before being touched. | **FOUND** |
| Why the first fix was not enough | It forbade dividing *inside the one-price branch*, which the model overrode with its own sense of what wire should cost. A blanket **"NEVER CALCULATE… copied digit for digit"** was not overridable. Verified three consecutive times on both failing images. | **FIXED** |
| The trap row still works | The blanket ban does not break the two-price rule: `25 no 95 = 2375` still returns **95**. Selection is not calculation. | **PASS** |
| Handwriting, three photo conditions | Flat, shadowed-and-creased, and crumpled — all five rows exact on each, including the smudged `3100`. | **PASS (live API)** |
| **Telugu handwriting** | వైర్ 1.5 / వైర్ 2.5 / స్విచ్ / సాకెట్ → "Wire 1.5", "Wire 2.5", "Switch", "Socket", every qty and rate exact. The thing the whole multilingual model choice was for, and it works on real handwriting. | **PASS (live API)** |
| **PI-8 multi-page against a real model** | Three pages read one call each (2.9s, 3.9s, 2.4s), merged by the real `mergePages`: 8 items, correct order, correct `p1`/`p2`/`p3` badges, no failed pages. PI-8's 18 browser checks all used a faked proxy — this is the first real one. | **PASS (live API)** |

**The lesson worth keeping: font-rendered mocks did not predict real
handwriting.** The first prompt fix passed every mock and still put five wrong
rupee figures on screen with `confidence: "full"` — every row had a qty and a
rate, so nothing warned Dad. A prompt rule the model can weigh against its own
commercial intuition is not a rule. Ban the behaviour outright.

**What this still does not prove:** these are Siva's slips, not Dad's, and they
were AI-generated images of handwriting rather than camera photographs — clean
ink, even strokes, no motion blur or focus miss. Real biro on a carbon copy in
shop light is still untested, and the smudge on one shot is the only genuine
degradation in the set.

**The Gemini path could not be checked at all.** `GEMINI_API_KEY` is empty in
`.env` — only `OPENROUTER_API_KEY` is set. Gemini is the code-level fallback, it
shares the rewritten prompt (so defect 2 is fixed there too), and it has the
**same latent defect 1**: `gemini.js` sends no `thinkingConfig`, so thinking
tokens are charged against the same 8192 ceiling. The one-line fix would be
`generationConfig.thinkingConfig = { thinkingBudget: 0 }` — **deliberately not
applied**, because this file's standing rule is that changing that ceiling blind
is a worse bet than leaving it, and with no key there is no way to verify. Left
for whoever has a Gemini key; the evidence that it matters is in this table.

### The generated PDF — DONE and VERIFIED 2026-08-12

The other thing nothing had ever looked at. Every PI-2 check read the **DOM**
that `sharePdf` rasterises, never the file — which is exactly how bug #8 hid.

`scripts/pdf-check.ts` closes it: it drives the built app in Chrome at **390px**,
seeds a quote, clicks the real Share button, catches the real download, and then
opens the file — page count, page geometry, and the embedded JPEGs extracted and
written out so they can be looked at. **20 checks, all passing.** It needs
`npm install --no-save playwright-core`, deliberately not a dependency, and it
drives the Chrome already on the machine rather than downloading one.

| Item | How it was verified | Result |
|---|---|---|
| **Bug #8 does not reproduce** | All five columns on, 390px viewport: the extracted page image is **1520px** wide — exactly the 760px document at html2canvas's scale 2 — so nothing is cropped. Checked on the file, not the DOM. | **PASS** |
| The table cannot spill out of the capture | The mechanism itself: `.cv-table` right edge (746.0) against `.cv-doc` right edge (774.0). Held even in the stress case below. | **PASS** |
| The numbers survive rasterising | Read off the generated image: ₹17,835 at 60%+1.5% → ₹7,026.99 × 6 = **₹42,162**; per-line GST summing to **₹9,013**; grand total **₹59,085**. The engine's per-line rounding, seen in the actual customer document. | **PASS** |
| Stress: unbreakable name, crore amounts, 20 rows | A part number with no spaces and a ₹9,98,99,001 amount — the widest a cell ever gets, since `formatMoney` groups Indian-style. Still 1520px, still not clipped, and the crore totals render (₹11,80,60,552). | **PASS** |
| **Defect found — a page break guillotined an item row** | The 20-row quote broke at canvas y=2204, **through the middle of item 12**: its name on page 1, the rest of the same row on page 2, both halves sliced through the glyphs. `sharePdf` cut fixed page-sized bands with no regard for content. Fixed by `pageSlices()`, which prefers row boundaries; the break moved to 2107 and page 2 now opens on a whole row. | **FIXED** |
| Nothing is lost between pages | The page images sum to the document height (3576px of image vs 3574px of document), so slicing cannot silently drop a row. Asserted on both scenarios. | **PASS** |
| **The check can fail** | The mid-row check was run against the old code first: it failed on the 20-row quote and passed on the 6-row one. A check that cannot fail is worse than no check. | **PASS (red control)** |

**What this still does not check: the Web Share arm.** Headless Chrome *has*
`navigator.share`, and it **resolves** — silently, with no share sheet and no
file anywhere. The first run looked like a hang: no download, no error, the
button back to normal. The PDF had been built and handed to a share sheet that
does not exist. The check therefore forces the download branch, which receives
the identical blob — so this proves the *file*, and says nothing about the
Android share sheet. That stays on the handover list, where it needs a phone.
