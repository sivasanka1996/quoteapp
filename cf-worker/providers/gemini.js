// Gemini — the default provider, and the only one ever proved against a real
// image (spec §0.2: three rows read correctly from a mock slip in 5.6s).
//
// The Flash → Pro logic here is a straight move out of image-reader.js, not a
// rewrite. Flash reads Dad's slips well and costs almost nothing; Pro is the
// second attempt only, so the average read stays cheap and the bad read still
// gets a proper try.

import { PROMPT, RESPONSE_SCHEMA, normalize } from "../schema.js";
import { wlog } from "../log.js";
import { appConfig } from "../../config/app.config";

// Configured in config/app.config.ts — one place for every model id.
const MODELS = appConfig.ai.gemini.models;

export const id = "gemini";

/** The message to fail with when this provider has no key, or null if it does. */
export function missingKey(env) {
  return env?.GEMINI_API_KEY
    ? null
    : "GEMINI_API_KEY secret not set on this worker";
}

/**
 * Read one image. **Never throws** — a failure is `items: []` with `detail`
 * set. That is the whole provider contract (spec §4.2), and it is what lets
 * the router stay simple: it decides what to do with an empty list and never
 * handles an exception.
 */
export async function read(imageBase64, mimeType, env, rid) {
  const failures = [];

  for (const model of MODELS) {
    const startedAt = Date.now();
    const attempt = await readWith(model, imageBase64, mimeType, env.GEMINI_API_KEY);

    wlog(env, attempt.items.length > 0 ? "info" : "warn", "model attempt", {
      rid,
      provider: id,
      model,
      itemCount: attempt.items.length,
      ms: Date.now() - startedAt,
      detail: attempt.detail || undefined,
    });

    if (attempt.items.length > 0) {
      return { items: attempt.items, detail: "", model };
    }
    failures.push(attempt.detail);
  }

  return {
    items: [],
    detail: failures.filter(Boolean).join(" | "),
    model: MODELS[MODELS.length - 1],
  };
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
            temperature: appConfig.ai.temperature,
            maxOutputTokens: appConfig.ai.maxOutputTokens,
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
