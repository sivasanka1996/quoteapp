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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/list") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      const d = await r.json();
      return json({ models: (d.models || []).map(m => m.name) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS });
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

    let items = [];
    const failures = [];
    for (const model of MODELS) {
      const attempt = await readWith(model, imageBase64, mimeType, env.GEMINI_API_KEY);
      items = attempt.items;
      if (items.length > 0) break;
      failures.push(attempt.detail);
    }

    if (items.length === 0) {
      return json({
        items: [],
        confidence: "low",
        notes: "Could not read any items from this photo — try again straighter, closer and in better light.",
        detail: failures.filter(Boolean).join(" | "),
      });
    }

    return json({ items, confidence: confidenceOf(items), notes: "", detail: "" });
  },
};

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
