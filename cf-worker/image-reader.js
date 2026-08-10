// Cloudflare Worker — image-reading proxy for Quoteapp.
//
// This file is the router: origin allowlist, CORS, request shape, and the
// decision about what an empty item list means. It does not know how any model
// is called — that lives behind the one-function provider contract in
// `providers/`, so switching model is an env var, not a deploy (spec §4.3).

import { pickProvider } from "./providers/index.js";
import { confidenceOf } from "./schema.js";
import { wlog, newRequestId } from "./log.js";

// Who may spend the API key. The worker sits on one public URL with the key
// in its environment, so with `*` anyone reading the public repo had a free
// relay. Both Firebase hostnames are listed because Hosting answers on either,
// and both local ports because `npm run dev` and `npm run preview` differ.
const ALLOWED_ORIGINS = new Set([
  "https://quoteapp-3f48e.web.app",
  "https://quoteapp-3f48e.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:4173",
]);

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

  const provider = pickProvider(env);
  const keyError = provider.missingKey?.(env);
  if (keyError) return json({ error: keyError }, 500);

  wlog(env, "info", "read requested", {
    rid,
    provider: provider.id,
    mimeType,
    uploadBytes: imageBase64.length,
  });

  // The contract says this never throws — a failure arrives as an empty list
  // with `detail` set. That is why there is no try/catch around it.
  const { items, detail, model } = await provider.read(imageBase64, mimeType, env, rid);

  if (items.length === 0) {
    wlog(env, "error", "read produced nothing", {
      rid,
      provider: provider.id,
      ms: Date.now() - startedAt,
      detail,
    });
    return json({
      items: [],
      confidence: "low",
      notes: "Could not read any items from this photo — try again straighter, closer and in better light.",
      detail,
    });
  }

  const confidence = confidenceOf(items);
  wlog(env, "info", "read complete", {
    rid,
    provider: provider.id,
    model,
    itemCount: items.length,
    confidence,
    ms: Date.now() - startedAt,
  });
  return json({ items, confidence, notes: "", detail: "" });
}
