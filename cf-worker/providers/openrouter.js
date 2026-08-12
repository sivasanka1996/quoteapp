// OpenRouter — the challenger, behind the same contract as Gemini.
//
// It is here so that trying a different model is an env var rather than a
// deploy (spec §4.3). It is NOT the default and should not become one until
// something beats Gemini on Dad's real slips — cost is irrelevant at his
// volume (a few reads a day, cents a month either way), so **Telugu accuracy
// decides it** (spec §4.4).
//
// MODEL CHOICE — see config/app.config.ts. Corrected 2026-08-12 by a live read.
//
// This header used to state that `qwen/qwen3.7-flash` "does not exist" with
// vision and structured output, and that a 2026-08-10 catalogue re-fetch had
// proved it. Both claims were false. The catalogue was fetched again on
// 2026-08-12 — 406 entries — and that id is present, takes text+image+video,
// and is HALF the price of the model configured here. It was then pointed at a
// real slip and read all six rows correctly.
//
// Nothing was wrong with the model id in use; the note about the other one was
// invented. Verify against the catalogue rather than against a comment:
//
//   curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*"'

import { PROMPT, JSON_SCHEMA, normalize } from "../schema.js";
import { wlog } from "../log.js";
import { appConfig } from "../../config/app.config";

const ENDPOINT = appConfig.ai.openrouter.endpoint;

export const id = "openrouter";
export const DEFAULT_MODEL = appConfig.ai.openrouter.model;

/** The message to fail with when this provider has no key, or null if it does. */
export function missingKey(env) {
  return env?.OPENROUTER_API_KEY
    ? null
    : "OPENROUTER_API_KEY secret not set on this worker";
}

/**
 * Read one image. **Never throws** — a failure is `items: []` with `detail`
 * set, exactly as the Gemini provider behaves. See spec §4.2.
 *
 * There is no second-model escalation here, unlike Gemini's Flash → Pro. That
 * retry exists because Flash and Pro are a known-good pair at known prices; a
 * blind escalation between OpenRouter models would be guesswork with someone
 * else's money. Change the model with `OPENROUTER_MODEL` instead.
 */
export async function read(imageBase64, mimeType, env, rid) {
  const model = env?.OPENROUTER_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();

  let data;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env?.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter attributes traffic with these; harmless and useful when
        // reading the account's usage page later.
        "HTTP-Referer": "https://quoteapp-3f48e.web.app",
        "X-Title": "Quotation App",
      },
      body: JSON.stringify({
        model,
        temperature: appConfig.ai.temperature,
        max_tokens: appConfig.ai.maxOutputTokens,
        // Reasoning tokens are charged against max_tokens, so a thinking model
        // can spend the whole budget deliberating and return an empty string.
        // Measured doing exactly that — see config/app.config.ts.
        reasoning: { enabled: appConfig.ai.openrouter.reasoning },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "items", strict: true, schema: JSON_SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const detail = `${model} returned HTTP ${res.status}.`;
      wlog(env, "warn", "model attempt", {
        rid, provider: id, model, itemCount: 0, ms: Date.now() - startedAt, detail,
      });
      return { items: [], detail, model };
    }
    data = await res.json();
  } catch (e) {
    const detail = `${model} request failed: ${e.message}`;
    wlog(env, "warn", "model attempt", {
      rid, provider: id, model, itemCount: 0, ms: Date.now() - startedAt, detail,
    });
    return { items: [], detail, model };
  }

  const rawText = data?.choices?.[0]?.message?.content ?? "";
  if (!rawText) {
    const detail = `No reading from ${model}. ${JSON.stringify(data).slice(0, 300)}`;
    wlog(env, "warn", "model attempt", {
      rid, provider: id, model, itemCount: 0, ms: Date.now() - startedAt, detail,
    });
    return { items: [], detail, model };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Structured output should make this impossible; models still do it.
    const detail = rawText.slice(0, 300);
    wlog(env, "warn", "model attempt", {
      rid, provider: id, model, itemCount: 0, ms: Date.now() - startedAt, detail,
    });
    return { items: [], detail, model };
  }

  const items = normalize(parsed);
  wlog(env, items.length > 0 ? "info" : "warn", "model attempt", {
    rid, provider: id, model, itemCount: items.length, ms: Date.now() - startedAt,
  });
  return { items, detail: "", model };
}
