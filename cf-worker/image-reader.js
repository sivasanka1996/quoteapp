// Cloudflare Worker — Gemini image-reading proxy for Quoteapp

// When the caller passes `catalog` (existing Pricing items), Gemini is asked
// to also match each extracted line against it by meaning — not exact text —
// so OCR noise, abbreviations, and unit-formatting differences (e.g. "sqmm"
// vs "sq mm") still resolve to the right catalog row. See docs/pricing.md
// and docs/quotations.md for how callers use the resulting `catalogId`.
function buildPrompt(catalog) {
  const hasCatalog = Array.isArray(catalog) && catalog.length > 0;

  const schema = hasCatalog
    ? `[{"name":"item description in English","qty":number,"rate":number or null,"catalogId":"id from the catalog list below, or null"}]`
    : `[{"name":"item description in English","qty":number,"rate":number or null}]`;

  const catalogField = hasCatalog
    ? `\n- catalogId: if this item clearly matches one in the catalog list below, its id — match by meaning, not exact text (tolerate OCR mistakes, abbreviations, word order, spacing, unit formatting like "sqmm" vs "sq mm"); if nothing matches confidently, use null`
    : "";

  const catalogBlock = hasCatalog
    ? `\n\nExisting catalog (id: name) — use these ids for catalogId matching:\n${catalog.map((c) => `${c.id}: ${c.name}`).join("\n")}`
    : "";

  return `This image contains a list of electrical materials with quantities and prices. Focus only on the handwritten or printed document in the image — ignore any computer screens or backgrounds.

Understand the document and extract every line item. Return a JSON array only, no explanation:

${schema}

- name: what the item is (wire size, MCB, socket, lug, pipe, fan, isolator, etc.)
- qty: the quantity for that line item
- rate: the unit price per item (NOT the line total — if a line shows both a smaller and larger number, the smaller one is usually the unit rate)${catalogField}

Extract ALL items from top to bottom. Return only the JSON array.${catalogBlock}`;
}

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

    let imageBase64, mimeType, catalog;
    try {
      const body = await request.json();
      imageBase64 = body.imageBase64;
      mimeType = body.mimeType || "image/jpeg";
      catalog = Array.isArray(body.catalog) ? body.catalog : [];
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    if (!imageBase64) return json({ error: "imageBase64 is required" }, 400);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY secret not set on this worker" }, 500);

    let rawText = "", debugInfo = "";
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: buildPrompt(catalog) },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      );
      const data = await res.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!rawText) debugInfo = JSON.stringify(data).slice(0, 400);
    } catch (e) {
      return json({ error: `Gemini request failed: ${e.message}` }, 502);
    }

    if (!rawText) {
      return json({ items: [], confidence: "low", notes: `No response from Gemini. API data: ${debugInfo}` });
    }

    // Strip markdown fences and extract JSON array
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 400) });
    }

    let items;
    try {
      items = JSON.parse(arrMatch[0]);
    } catch {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 400) });
    }

    if (!items || items.length === 0) {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 400) });
    }

    return json({ items, confidence: "partial", notes: "" });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
