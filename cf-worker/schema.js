// What every provider is asked for, and what every provider must hand back.
//
// Shared so that swapping Gemini for OpenRouter cannot quietly change the
// prompt or the item shape — those are the two things a model comparison has
// to hold constant to mean anything (spec §4.4).

export const PROMPT = `This image contains a list of electrical materials with quantities and prices. Focus only on the handwritten or printed document in the image — ignore any computer screens or backgrounds.

Understand the document and extract every line item, top to bottom.

- name: what the item is, in English (wire size, MCB, socket, lug, pipe, fan, isolator, etc.)
- qty: the quantity for that line item
- rate: the unit price per item.
  - If the line has ONE price on it, that price IS the rate. Return it exactly as written. Do not treat it as a line total and do not divide it by the quantity.
  - If the line has TWO prices on it, the smaller is the rate and the larger is the line total (quantity x rate). Return the smaller one.
  - Only leave rate out when the line has no price written on it at all.`;

// The reply shape is enforced by the API, not by parsing prose. Gemini takes an
// OpenAPI subset here; keep it to types it actually supports.
export const RESPONSE_SCHEMA = {
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

/**
 * The same schema as JSON Schema, for providers that speak OpenAI's
 * `response_format` rather than Gemini's `responseSchema`.
 *
 * OpenAI-compatible structured output requires a top-level *object*, so the
 * array is wrapped in one. `normalize` unwraps it.
 */
export const JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          rate: { type: ["number", "null"] },
        },
        required: ["name", "qty"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/**
 * Trust the schema for shape, not for sense. A blank name is a row Dad would
 * have to delete; a missing rate must stay null so the confirm list shows an
 * empty field instead of pricing the line at zero.
 *
 * Accepts either a bare array or `{ items: [...] }`, because the two structured
 * output dialects above disagree about which one they can return.
 */
export function normalize(parsed) {
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : [];
  return rows
    .map((it) => ({
      name: typeof it?.name === "string" ? it.name.trim() : "",
      qty: Number.isFinite(Number(it?.qty)) ? Number(it.qty) : 0,
      rate: Number.isFinite(Number(it?.rate)) && it?.rate !== null ? Number(it.rate) : null,
    }))
    .filter((it) => it.name !== "");
}

/**
 * What the read is worth, not a fixed label. "full" means every row is ready to
 * quote; "partial" means at least one row still needs a number typed in.
 */
export function confidenceOf(items) {
  if (items.length === 0) return "low";
  return items.every((it) => it.qty > 0 && it.rate !== null) ? "full" : "partial";
}
