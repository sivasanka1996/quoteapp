// Cloudflare Worker — Gemini image-reading proxy for Quoteapp
//
// Deploy:
//   cd cf-worker
//   npx wrangler deploy
//   npx wrangler secret put GEMINI_API_KEY   ← paste key when prompted
//
// Then set VITE_IMAGE_PROXY_URL=https://<your-worker>.workers.dev in .env.local

const PROMPT = `You are reading a handwritten or printed list of electrical materials.
The image may contain Telugu, English, or mixed text.

Look at every line in the image and extract each item. Even if writing is unclear, make your best guess.

For each line item extract:
- name: describe the item in English (e.g. "1.5 sq mm wire", "6A socket", "40A isolator", "MCB 20A", "copper lug"). Keep sizes and specs.
- qty: the number/quantity on that line (default 1 if unclear)
- rate: any price/rate shown for that item (null if not visible)

IMPORTANT: You MUST return ONLY a raw JSON object. No markdown, no code fences, no explanation.
Example of the exact format required:
{"items":[{"name":"1.5 sq mm wire","qty":6,"rate":null},{"name":"6A socket","qty":16,"rate":83}],"confidence":"partial","notes":""}`;

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

    // Strip markdown code fences if present
    let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    // Extract the first JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 300) });
    }

    try {
      const result = JSON.parse(jsonMatch[0]);
      // Always include raw text in notes for debugging when items is empty
      if (!result.items || result.items.length === 0) {
        result.notes = (result.notes ? result.notes + " | " : "") + "Raw: " + rawText.slice(0, 200);
      }
      return json(result);
    } catch {
      return json({ items: [], confidence: "low", notes: rawText.slice(0, 300) });
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
