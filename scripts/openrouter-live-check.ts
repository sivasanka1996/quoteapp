/**
 * Live check — does the real OpenRouter API answer the body this repo builds?
 *
 *   powershell -ExecutionPolicy Bypass -File scripts/make-mock-slips.ps1
 *   npx vite-node scripts/openrouter-live-check.ts
 *
 * WHY THIS EXISTS. All 57 worker tests stub `globalThis.fetch`, so no request
 * this code builds had ever received a real 200. The model id, the
 * `response_format` dialect, the image part shape and the token ceiling were
 * all unproven — and one of them being wrong means every read fails.
 *
 * It drives the REAL worker (`cf-worker/image-reader.js` default export) with a
 * real `Request`, so the router, the origin allowlist, `pickProvider`, the
 * provider and `schema.js`'s `normalize`/`confidenceOf` are all the shipping
 * ones. Nothing is stubbed but the transport into the Worker itself.
 *
 * THIS SPENDS REAL MONEY — about a hundredth of a cent per read. It is
 * deliberately not a *.test.ts, so `npm test` and CI never pick it up.
 *
 * The key is read out of `.env`, which is gitignored. Nothing else in this repo
 * reads `.env` at runtime (Vite would compile it into the public bundle, and the
 * Worker never sees it), so this script parses it itself.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import worker from "../cf-worker/image-reader.js";
import { appConfig } from "../config/app.config";
import { mergePages, type PageResult } from "../src/parse/mergePages";

const ROOT = process.cwd();
const APP_ORIGIN = "https://quoteapp-3f48e.web.app";

// ---------------------------------------------------------------------------
// What is written on the mock slips, so a read can be marked right or wrong
// ---------------------------------------------------------------------------

interface Row {
  /** Any one of these in the returned name counts as the right item. */
  keywords: string[];
  qty: number;
  rate: number;
  note?: string;
}

interface Slip {
  file: string;
  label: string;
  rows: Row[];
  /** Skip with a warning if the image is absent — fixtures are gitignored. */
  optional?: boolean;
}

/** The five items on the single-page handwritten slips, which share content. */
const HANDWRITTEN_ROWS: Row[] = [
  { keywords: ["1.5"], qty: 10, rate: 1650 },
  { keywords: ["2.5"], qty: 6, rate: 2450 },
  {
    keywords: ["4 sq", "4sq"], qty: 4, rate: 3100,
    // On the messy and crumpled photos the last two digits of 3100 are smudged
    // into ink blobs. Kept as an expectation rather than excused: reading it as
    // 31 or 3 is exactly the kind of plausible-looking wrong number worth
    // knowing about, and the whole point of shooting a bad photo on purpose.
    note: "the 0s are smudged on the messy/crumpled shots",
  },
  { keywords: ["6a"], qty: 12, rate: 120 },
  { keywords: ["16a"], qty: 8, rate: 185 },
];

const SLIPS: Slip[] = [
  {
    file: "fixtures/slips/mock-english.jpg",
    label: "English, handwriting font",
    rows: [
      { keywords: ["wire"], qty: 6, rate: 1650 },
      { keywords: ["mcb"], qty: 4, rate: 450 },
      {
        keywords: ["switch"], qty: 25, rate: 95,
        // The prompt's "if a line shows both a smaller and a larger number, the
        // smaller one is usually the unit rate" instruction, tested. This row
        // reads "25 no  95 = 2375" on the paper. A rate of 2375 means the model
        // quoted the line total as the unit price — the worst kind of wrong,
        // because the number looks plausible.
        note: "line-total trap (2375 is the total, 95 is the rate)",
      },
      { keywords: ["conduit", "pipe"], qty: 30, rate: 48 },
      { keywords: ["lug"], qty: 12, rate: 125 },
      { keywords: ["fan"], qty: 8, rate: 70 },
    ],
  },
  {
    file: "fixtures/slips/mock-telugu.jpg",
    label: "Telugu item names",
    rows: [
      { keywords: ["wire"], qty: 5, rate: 1650 },
      { keywords: ["switch"], qty: 3, rate: 240 },
      { keywords: ["mcb"], qty: 10, rate: 450 },
      { keywords: ["pipe", "conduit"], qty: 20, rate: 48 },
      { keywords: ["fan"], qty: 8, rate: 70 },
    ],
  },

  // --- The real slips, 2026-08-12 -----------------------------------------
  // Handwritten rather than font-rendered, photographed on a table with a
  // hand in shot, shadows, creases and a smudge. Prepared through
  // scripts/prepare-slips.ps1 first, so the model sees the 1600px JPEG the app
  // would actually upload rather than the multi-megabyte original.
  {
    file: "fixtures/slips/prepared/real-clean.jpg",
    label: "real: flat, evenly lit",
    rows: HANDWRITTEN_ROWS,
    optional: true,
  },
  {
    file: "fixtures/slips/prepared/real-messy.jpg",
    label: "real: handheld, shadowed, creased, smudged",
    rows: HANDWRITTEN_ROWS,
    optional: true,
  },
  {
    file: "fixtures/slips/prepared/real-crumpled.jpg",
    label: "real: handheld, crumpled",
    rows: HANDWRITTEN_ROWS,
    optional: true,
  },
  {
    file: "fixtures/slips/prepared/real-telugu.jpg",
    label: "real: Telugu item names",
    rows: [
      { keywords: ["wire", "1.5"], qty: 10, rate: 1650 },
      { keywords: ["wire", "2.5"], qty: 6, rate: 2450 },
      { keywords: ["switch"], qty: 15, rate: 240 },
      { keywords: ["socket"], qty: 20, rate: 95 },
    ],
    optional: true,
  },
];

/**
 * The three-page order, read the way PI-8 reads it: one call per page, in
 * sequence, merged by the real `mergePages`.
 *
 * This is the first time the multi-page path has met a real model — PI-8's
 * 18 browser checks all ran against a faked proxy.
 */
const MULTIPAGE = {
  files: [
    "fixtures/slips/prepared/real-page1.jpg",
    "fixtures/slips/prepared/real-page2.jpg",
    "fixtures/slips/prepared/real-page3.jpg",
  ],
  rows: [
    { keywords: ["1.5"], qty: 10, rate: 1650, page: 1 },
    { keywords: ["2.5"], qty: 6, rate: 2450, page: 1 },
    { keywords: ["4 sq", "4sq"], qty: 4, rate: 3100, page: 2 },
    { keywords: ["6 sq", "6sq"], qty: 2, rate: 4300, page: 2 },
    { keywords: ["6a"], qty: 12, rate: 120, page: 2 },
    { keywords: ["16a"], qty: 8, rate: 185, page: 3 },
    { keywords: ["socket"], qty: 20, rate: 95, page: 3 },
    { keywords: ["conduit", "pipe"], qty: 15, rate: 40, page: 3 },
  ],
};

// ---------------------------------------------------------------------------

const results: Array<[string, boolean, string]> = [];
function check(label: string, pass: boolean, detail = "") {
  results.push([label, pass, detail]);
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Item names are graded but do not fail the run, and the split is deliberate.
 *
 * A wrong NUMBER is money — Dad quotes ₹330 instead of ₹1650 and never sees it.
 * A wrong NAME is visible: it sits in the confirm list in front of him and he
 * retypes it. So the numbers are a contract this script enforces, while the
 * names are a measurement of how well the current model transliterates Telugu —
 * which is exactly the thing CLAUDE.md says should decide the model, and which
 * moves whenever the model does. Failing the build on it would make the script
 * useless as a regression gate.
 */
const notes: string[] = [];
function note(label: string, ok: boolean, detail = "") {
  if (!ok) notes.push(`${label} — ${detail}`);
  console.log(`${ok ? "PASS" : "NOTE"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function loadEnvFile(): Record<string, string> {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) {
    throw new Error(`.env not found at ${path} — run this from the repo root.`);
  }
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(val)) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

interface ReadItem { name: string; qty: number; rate: number | null }
interface WorkerReply {
  items?: ReadItem[];
  confidence?: string;
  notes?: string;
  detail?: string;
  error?: string;
}

async function callWorker(
  file: string,
  env: Record<string, string>,
  origin: string | null = APP_ORIGIN
): Promise<{ status: number; body: WorkerReply; ms: number }> {
  const bytes = readFileSync(resolve(ROOT, file));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;

  const startedAt = Date.now();
  const res = await worker.fetch(
    new Request(`${appConfig.worker.url}/`, {
      method: "POST",
      headers,
      // Exactly what `readImage.ts` posts: base64 with no data: prefix.
      body: JSON.stringify({
        imageBase64: bytes.toString("base64"),
        mimeType: "image/jpeg",
      }),
    }),
    env
  );
  const ms = Date.now() - startedAt;
  const text = await res.text();
  let body: WorkerReply;
  try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
  return { status: res.status, body, ms };
}

function gradeSlip(slip: Slip, items: ReadItem[]) {
  console.log(`\n  what came back (${items.length} rows):`);
  for (const [i, it] of items.entries()) {
    console.log(
      `    ${String(i + 1).padStart(2)}. ${it.name.padEnd(34)} qty ${String(it.qty).padEnd(6)} rate ${it.rate ?? "(null)"}`
    );
  }
  console.log("");

  check(
    `${slip.label}: row count is ${slip.rows.length}`,
    items.length === slip.rows.length,
    `got ${items.length}`
  );

  for (const [i, want] of slip.rows.entries()) {
    const got = items[i];
    const where = `${slip.label}: row ${i + 1} (${want.keywords[0]})`;
    if (!got) {
      check(where, false, "no row came back at this position");
      continue;
    }
    const name = got.name.toLowerCase();
    note(
      `${where} name mentions ${want.keywords.join(" or ")}`,
      want.keywords.some((k) => name.includes(k)),
      `got "${got.name}"`
    );
    check(`${where} qty is ${want.qty}`, got.qty === want.qty, `got ${got.qty}`);
    check(
      `${where} rate is ${want.rate}${want.note ? ` — ${want.note}` : ""}`,
      got.rate === want.rate,
      `got ${got.rate ?? "(null)"}`
    );
  }
}

async function main() {
  const fileEnv = loadEnvFile();
  if (!fileEnv.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in .env");
  }
  for (const slip of SLIPS) {
    if (!existsSync(resolve(ROOT, slip.file)) && !slip.optional) {
      throw new Error(`${slip.file} missing — run scripts/make-mock-slips.ps1 first.`);
    }
  }

  // The provider is deliberately NOT forced. Leaving AI_PROVIDER unset means
  // `pickProvider` falls through to config/app.config.ts, so this checks what
  // actually ships rather than what the script asks for.
  const env = { OPENROUTER_API_KEY: fileEnv.OPENROUTER_API_KEY, LOG_LEVEL: "silent" };

  console.log(`provider per config: ${appConfig.ai.provider}`);
  console.log(`model per config:    ${appConfig.ai.openrouter.model}\n`);

  // -- Controls first ------------------------------------------------------
  // A check that cannot fail is worse than no check, so prove this one can
  // before trusting the passes below.

  console.log("--- controls ---");

  const refused = await callWorker(SLIPS[0].file, env, null);
  check(
    "CONTROL: a request with no Origin is refused (no API call made)",
    refused.status === 403,
    `status ${refused.status}`
  );

  // Point the real pipeline at a model id that cannot exist. If this "passes",
  // the harness is not actually reading anything and no green below means
  // anything.
  //
  // NOTE: the first version of this control used `qwen/qwen3.7-flash`, because
  // both CLAUDE.md and openrouter.js said that id does not exist. It returned
  // six correct items. The catalogue was re-fetched on 2026-08-12: all 406
  // entries, and qwen3.7-flash is there — text+image, and *cheaper* than the
  // configured model. The note claiming otherwise was wrong. Hence a made-up id
  // here, which is the only thing guaranteed to fail.
  const phantom = await callWorker(SLIPS[0].file, {
    ...env,
    OPENROUTER_MODEL: "qwen/qwen-model-that-does-not-exist",
  });
  check(
    "CONTROL: a bad model id produces an empty read, not a false pass",
    (phantom.body.items?.length ?? 0) === 0 && phantom.body.confidence === "low",
    `${phantom.body.items?.length ?? 0} items, confidence ${phantom.body.confidence} — ${String(phantom.body.detail).slice(0, 160)}`
  );

  // -- The real reads ------------------------------------------------------

  for (const slip of SLIPS) {
    if (slip.optional && !existsSync(resolve(ROOT, slip.file))) {
      console.log(`\n--- ${slip.file} — SKIPPED, not present ---`);
      continue;
    }
    console.log(`\n--- ${slip.file} (${slip.label}) ---`);
    const { status, body, ms } = await callWorker(slip.file, env);
    console.log(`  HTTP ${status} in ${ms}ms, confidence "${body.confidence}"`);
    if (body.detail) console.log(`  detail: ${body.detail}`);

    check(`${slip.label}: worker answered 200`, status === 200, `status ${status}`);
    if (!body.items || body.items.length === 0) {
      check(`${slip.label}: the model read something`, false, body.detail || body.notes || "empty item list");
      continue;
    }
    check(`${slip.label}: the model read something`, true, `${body.items.length} items in ${ms}ms`);
    gradeSlip(slip, body.items);
  }

  // -- The three-page order, read page by page -----------------------------

  if (MULTIPAGE.files.every((f) => existsSync(resolve(ROOT, f)))) {
    console.log(`\n--- ${MULTIPAGE.files.length}-page order (PI-8, against a real model) ---`);

    const pages: PageResult[] = [];
    const timings: string[] = [];
    for (const [i, file] of MULTIPAGE.files.entries()) {
      const startedAt = Date.now();
      const { body } = await callWorker(file, env);
      timings.push(`p${i + 1} ${Date.now() - startedAt}ms`);
      pages.push(
        body.items && body.items.length > 0
          ? { ok: true, items: body.items }
          : { ok: false, error: body.detail || body.notes || "empty" }
      );
    }

    // The real merge, not a reimplementation of it.
    const merged = mergePages(pages);
    console.log(`  ${timings.join(", ")}`);
    console.log(`\n  merged list (${merged.items.length} rows, failed pages: ${merged.failed.join(", ") || "none"}):`);
    for (const it of merged.items) {
      console.log(`    p${it.page}  ${it.name.padEnd(28)} qty ${String(it.qty).padEnd(5)} rate ${it.rate ?? "(null)"}`);
    }
    console.log("");

    check("3-page: every page read", merged.failed.length === 0, `failed: ${merged.failed.join(", ") || "none"}`);
    check(
      `3-page: all ${MULTIPAGE.rows.length} items across the three pages`,
      merged.items.length === MULTIPAGE.rows.length,
      `got ${merged.items.length}`
    );

    for (const [i, want] of MULTIPAGE.rows.entries()) {
      const got = merged.items[i];
      const where = `3-page: row ${i + 1} (${want.keywords[0]})`;
      if (!got) {
        check(where, false, "no row at this position");
        continue;
      }
      note(
        `${where} name mentions ${want.keywords.join(" or ")}`,
        want.keywords.some((k) => got.name.toLowerCase().includes(k)),
        `got "${got.name}"`
      );
      check(`${where} qty is ${want.qty}`, got.qty === want.qty, `got ${got.qty}`);
      check(`${where} rate is ${want.rate}`, got.rate === want.rate, `got ${got.rate ?? "(null)"}`);
      // The badge Dad sees on the confirm row. A page number that drifts is
      // how a retry re-reads the wrong photo.
      check(`${where} is badged page ${want.page}`, got.page === want.page, `got p${got.page}`);
    }
  } else {
    console.log("\n--- 3-page order — SKIPPED, prepared pages not present ---");
  }
}

main()
  .catch((e) => check("ran without throwing", false, String(e)))
  .finally(() => {
    const failed = results.filter(([, pass]) => !pass).length;
    console.log(
      failed === 0
        ? `\nall ${results.length} checks passed`
        : `\n${failed} of ${results.length} FAILED`
    );
    if (notes.length) {
      console.log(
        `\n${notes.length} item name(s) the model got wrong — how well it reads` +
        ` Telugu, not a broken contract:`
      );
      for (const n of notes) console.log(`  · ${n}`);
    }
    process.exit(failed === 0 ? 0 : 1);
  });
