// Cloudflare Worker — Gemini image-reading proxy for Quoteapp
//
// Deploy:
//   cd cf-worker
//   npx wrangler deploy
//   npx wrangler secret put GEMINI_API_KEY   ← paste key when prompted
//
// Then set VITE_IMAGE_PROXY_URL=https://<your-worker>.workers.dev in .env.local

const PROMPT = `Please transcribe every line of text visible in this image exactly as written. Include all numbers, words, and symbols you can see. Write each line of the original document on a new line. Do not skip any lines even if unclear - write your best guess.`;

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

    // Debug: list available models
    if (url.pathname === "/list") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      const d = await r.json();
      const names = (d.models || []).map(m => m.name);
      return json({ models: names });
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

let rawText = "";
    let debugInfo = "";
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
          }),
        }
      );
      const data = await res.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!rawText) {
        debugInfo = JSON.stringify(data).slice(0, 400);
      }
    } catch (e) {
      return json({ error: `Gemini request failed: ${e.message}` }, 502);
    }

    if (!rawText) {
      return json({ items: [], confidence: "low", notes: `No response from Gemini. API data: ${debugInfo}` });
    }

    // Parse raw transcription lines — each line like "6- 1.5sq ... 1650/- 9900"
    const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 2);
    const items = [];
    for (const line of lines) {
      // Extract leading number as qty (e.g. "6-", "16-", "1-", "9-")
      const qtyMatch = line.match(/^(\d+)\s*[-–]?\s*/);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
      // Remove the leading qty, get rest as name
      const rest = qtyMatch ? line.slice(qtyMatch[0].length).trim() : line;
      if (!rest || rest.length < 2) continue;
      // Extract last number as rate if present
      const rateMatch = rest.match(/[\s\/](\d[\d,]*)\s*\/?[-–]?\s*$/);
      const rate = rateMatch ? parseFloat(rateMatch[1].replace(/,/g, "")) : null;
      const name = rateMatch ? rest.slice(0, rest.length - rateMatch[0].length).trim() : rest;
      if (name.length > 0) items.push({ name, qty, rate });
    }

    if (items.length === 0) {
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
