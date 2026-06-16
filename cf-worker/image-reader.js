// Cloudflare Worker — Gemini image-reading proxy for Quoteapp
//
// Deploy:
//   cd cf-worker
//   npx wrangler deploy
//   npx wrangler secret put GEMINI_API_KEY   ← paste key when prompted
//
// Then set VITE_IMAGE_PROXY_URL=https://<your-worker>.workers.dev in .env.local

const PROMPT = `You are reading a list of electrical materials from a handwritten or printed image.
The text may be in Telugu, English, or a mix of both.
Extract every line item you can find.

For each item, extract:
- name: item description in English (translate Telugu if needed; keep technical terms like MCB, RCCB, wire, mm, A, V as-is)
- qty: quantity as a number (use 1 if not specified or unclear)
- rate: unit price or rate as a number (null if not found in the image)

Return ONLY valid JSON — no explanation, no markdown, no code block:
{"items":[{"name":"...","qty":1,"rate":null}],"confidence":"full","notes":""}

confidence must be one of: full (all items clearly read), partial (some items unclear), low (very hard to read)
notes: one short sentence if anything was unclear or skipped, otherwise empty string`;

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

    if (!imageBase64) {
      return json({ error: "imageBase64 is required" }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY secret not set on this worker" }, 500);
    }

    let geminiData;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  { inline_data: { mime_type: mimeType, data: imageBase64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );
      geminiData = await res.json();
    } catch (e) {
      return json({ error: `Gemini request failed: ${e.message}` }, 502);
    }

    const rawText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ items: [], confidence: "low", notes: "Could not parse response from Gemini" });
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return json({ items: [], confidence: "low", notes: "Malformed JSON from Gemini" });
    }

    return json(result);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
