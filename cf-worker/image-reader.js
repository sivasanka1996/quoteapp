// Cloudflare Worker — Gemini image-reading proxy for Quoteapp

const PROMPT = `This image contains a list of electrical materials with quantities and prices. Focus only on the handwritten or printed document in the image — ignore any computer screens or backgrounds.

Understand the document and extract every line item, top to bottom.

- name: what the item is, in English (wire size, MCB, socket, lug, pipe, fan, isolator, etc.)
- qty: the quantity for that line item
- rate: the unit price per item — NOT the line total. If a line shows both a smaller and a larger number, the smaller one is usually the unit rate. If no unit rate is written, leave rate out rather than guessing.`;

// The reply shape is enforced by the API, not by parsing prose. Gemini takes an
// OpenAPI subset here; keep it to types it actually supports.
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      qty: { type: "NUMBER" },
      rate: { type: "NUMBER", nullable: true },
    },
    required: ["name", "qty"],
  },
};

// Flash reads Dad's slips well and costs almost nothing. Pro is the second
// attempt only — it runs when Flash comes back with nothing usable, so the
// average read stays cheap and the bad read still gets a proper try.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"];

// Who may spend the Gemini key. The worker sits on one public URL with the key
// in its environment, so with `*` anyone reading the public repo had a free
// relay. Both Firebase hostnames are listed because Hosting answers on either,
// and both local ports because `npm run dev` and `npm run preview` differ.
const ALLOWED_ORIGINS = new Set([
  "https://quoteapp-3f48e.web.app",
  "https://quoteapp-3f48e.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:4173",
]);

// --- Logging ---
//
// A Worker has no filesystem and no ring buffer to export, so "logging" here
// means one structured line per event on stdout, which `npx wrangler tail`
// streams live and the Cloudflare dashboard keeps. JSON rather than prose so
// the fields stay greppable.
//
// Set LOG_LEVEL=silent in wrangler.toml (or a test env) to turn it off. Same
// rule as the client logger: this must never throw, because every call site is
// on the request path.
function wlog(env, level, msg, fields = {}) {
  try {
    if (env?.LOG_LEVEL === "silent") return;
    console.log(
      JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })
    );
  } catch {
    /* a log line is never worth failing a read for */
  }
}

function newRequestId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

// Vary matters: without it a cache could hand one origin's answer to another.
function corsFor(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const rid = newRequestId();
    const startedAt = Date.now();
    try {
      return await handle(request, env, rid, startedAt);
    } catch (e) {
      // Worker layer (spec §2.4): log it fully, tell the client nothing but the
      // shape it already expects. A stack trace in the response body would leak
      // internals to anyone who can reach the URL.
      wlog(env, "error", "unhandled worker error", {
        rid,
        ms: Date.now() - startedAt,
        err: e?.message,
        stack: e?.stack,
      });
      return new Response(
        JSON.stringify({ error: "Image reading failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", "Vary": "Origin" } }
      );
    }
  },
};

async function handle(request, env, rid, startedAt) {
    const url = new URL(request.url);

    // Refuse before doing any work, and refuse a *missing* Origin too. CORS
    // headers alone would not have closed this: they only stop other browser
    // pages reading the reply, while curl — which sends no Origin — would still
    // be served. A browser always sends one, so nothing legitimate is lost.
    //
    // Honest limit: a script can still set the header by hand. This turns a
    // relay anyone could paste into a console into one you have to mean to
    // abuse. Verifying a Firebase Auth token is what would actually close it,
    // and that waits on PI-4.1.
    const origin = request.headers.get("Origin");
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      wlog(env, "warn", "origin refused", { rid, origin: origin ?? null });
      return new Response("Forbidden — this worker only answers the quotation app.", {
        status: 403,
        headers: { "Vary": "Origin" },
      });
    }
    const cors = corsFor(origin);
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/list") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      const d = await r.json();
      return json({ models: (d.models || []).map(m => m.name) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    let imageBase64, mimeType;
    try {
      const body = await request.json();
      imageBase64 = body.imageBase64;
      mimeType = body.mimeType || "image/jpeg";
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    if (!imageBase64) return json({ error: "imageBase64 is required" }, 400);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY secret not set on this worker" }, 500);

    wlog(env, "info", "read requested", {
      rid,
      provider: "gemini",
      mimeType,
      uploadBytes: imageBase64.length,
    });

    let items = [];
    let usedModel = null;
    const failures = [];
    for (const model of MODELS) {
      const modelStartedAt = Date.now();
      const attempt = await readWith(model, imageBase64, mimeType, env.GEMINI_API_KEY);
      items = attempt.items;
      usedModel = model;
      wlog(env, items.length > 0 ? "info" : "warn", "model attempt", {
        rid,
        provider: "gemini",
        model,
        itemCount: items.length,
        ms: Date.now() - modelStartedAt,
        detail: attempt.detail || undefined,
      });
      if (items.length > 0) break;
      failures.push(attempt.detail);
    }

    if (items.length === 0) {
      wlog(env, "error", "read produced nothing", {
        rid,
        provider: "gemini",
        ms: Date.now() - startedAt,
        detail: failures.filter(Boolean).join(" | "),
      });
      return json({
        items: [],
        confidence: "low",
        notes: "Could not read any items from this photo — try again straighter, closer and in better light.",
        detail: failures.filter(Boolean).join(" | "),
      });
    }

    const confidence = confidenceOf(items);
    wlog(env, "info", "read complete", {
      rid,
      provider: "gemini",
      model: usedModel,
      itemCount: items.length,
      confidence,
      ms: Date.now() - startedAt,
    });
    return json({ items, confidence, notes: "", detail: "" });
}

/**
 * One read attempt against one model. Never throws: a failure comes back as an
 * empty item list plus a technical `detail`, because the caller's job is to
 * decide whether to try the next model, not to handle exceptions.
 */
async function readWith(model, imageBase64, mimeType, apiKey) {
  let data;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ]}],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );
    if (!res.ok) {
      return { items: [], detail: `${model} returned HTTP ${res.status}.` };
    }
    data = await res.json();
  } catch (e) {
    return { items: [], detail: `${model} request failed: ${e.message}` };
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!rawText) {
    return { items: [], detail: `No reading from ${model}. ${JSON.stringify(data).slice(0, 300)}` };
  }

  // responseSchema means this is JSON or the request failed — there is no prose
  // to hunt a fence out of any more.
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { items: [], detail: rawText.slice(0, 300) };
  }

  return { items: normalize(parsed), detail: "" };
}

/**
 * What the read is worth, not a fixed label. "full" means every row is ready to
 * quote; "partial" means at least one row still needs a number typed in.
 */
function confidenceOf(items) {
  if (items.length === 0) return "low";
  return items.every((it) => it.qty > 0 && it.rate !== null) ? "full" : "partial";
}

/**
 * Trust the schema for shape, not for sense. A blank name is a row Dad would
 * have to delete; a missing rate must stay null so the confirm list shows an
 * empty field instead of pricing the line at zero.
 */
function normalize(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((it) => ({
      name: typeof it?.name === "string" ? it.name.trim() : "",
      qty: Number.isFinite(Number(it?.qty)) ? Number(it.qty) : 0,
      rate: Number.isFinite(Number(it?.rate)) && it?.rate !== null ? Number(it.rate) : null,
    }))
    .filter((it) => it.name !== "");
}
