// Cloudflare Worker — Gemini image-reading proxy for Quoteapp
//
// Deploy:
//   cd cf-worker
//   npx wrangler deploy
//   npx wrangler secret put GEMINI_API_KEY   ← paste key when prompted
//
// Then set VITE_IMAGE_PROXY_URL=https://<your-worker>.workers.dev in .env.local

const PROMPT = `This is a handwritten list of electrical materials. The text may be in Telugu, English, or mixed.

Read every line carefully and list each item in exactly this format (one item per line):
QTY | ITEM NAME | RATE

Rules:
- QTY: the number at the start of the line (use 1 if not clear)
- ITEM NAME: describe the item in English. Keep sizes like 1.5sq, 2.5sq, 4sq, 6mm, 10mm, MCB, RCCB, socket, wire, lug, pipe, isolator, plug, fan
- RATE: the price/amount shown (use - if not visible)

Example output:
6 | 1.5 sq mm wire | -
16 | 6A socket | 83
1 | 40A isolator | 350
9 | Fan Apollo | 287

Write ONLY the list lines. No explanation, no headers, nothing else.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
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
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
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
    } catch (e) {
      return json({ error: `Gemini request failed: ${e.message}` }, 502);
    }

    // Parse pipe-delimited plain text: "QTY | NAME | RATE"
    const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.includes("|"));
    const items = lines.map(line => {
      const parts = line.split("|").map(p => p.trim());
      const qty = parseInt(parts[0]) || 1;
      const name = parts[1] || parts[0] || "";
      const rateStr = parts[2] || "";
      const rate = rateStr && rateStr !== "-" ? (parseFloat(rateStr) || null) : null;
      return { name, qty, rate };
    }).filter(it => it.name.length > 0);

    if (items.length === 0) {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 300) });
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
