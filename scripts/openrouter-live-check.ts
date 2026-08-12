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
}

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
];

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
    if (!existsSync(resolve(ROOT, slip.file))) {
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
