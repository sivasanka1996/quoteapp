// Which model reads the photo, chosen by an environment variable.
//
// The point of the abstraction is not elegance — it is that **rollback becomes
// an env var rather than a deploy** (spec §4.3). If a new provider reads Dad's
// Telugu worse than Gemini, `wrangler secret put` / a dashboard edit puts it
// back in seconds, without a build.
//
// Gemini stays the default because it is the only provider ever proved against
// a real image (spec §0.2). A challenger has to beat it on Dad's actual slips,
// and cost is not the deciding factor — Telugu accuracy is.

import * as gemini from "./gemini.js";
import * as openrouter from "./openrouter.js";
import { wlog } from "../log.js";

const PROVIDERS = {
  [gemini.id]: gemini,
  [openrouter.id]: openrouter,
};

export const DEFAULT_PROVIDER = gemini.id;

/**
 * The provider named by `AI_PROVIDER`, or Gemini.
 *
 * An unknown name falls back and logs a warn rather than failing the request.
 * A typo in an env var must never be the reason Dad cannot read a slip in a
 * shop — a wrong-but-working model beats a 500.
 */
export function pickProvider(env) {
  const name = (env?.AI_PROVIDER || "").trim().toLowerCase();
  if (!name) return PROVIDERS[DEFAULT_PROVIDER];

  const chosen = PROVIDERS[name];
  if (chosen) return chosen;

  wlog(env, "warn", "unknown AI_PROVIDER, falling back", {
    requested: name,
    using: DEFAULT_PROVIDER,
    known: Object.keys(PROVIDERS),
  });
  return PROVIDERS[DEFAULT_PROVIDER];
}
