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
import { appConfig } from "../../config/app.config";

const PROVIDERS = {
  [gemini.id]: gemini,
  [openrouter.id]: openrouter,
};

/**
 * The last-resort fallback, and deliberately NOT the configured provider.
 *
 * If `config/app.config.ts` itself names something unknown, we still have to
 * answer. Gemini is the one provider ever proved against a real image.
 */
export const DEFAULT_PROVIDER = gemini.id;

/**
 * Which provider reads the photo.
 *
 * Precedence: `AI_PROVIDER` env var > `config/app.config.ts` > gemini. The env
 * var comes first so a rollback is a Cloudflare dashboard edit that takes
 * effect on the next request — no deploy, no build.
 *
 * An unknown name falls back and logs a warn rather than failing the request.
 * A typo must never be the reason Dad cannot read a slip in a shop — a
 * wrong-but-working model beats a 500.
 */
export function pickProvider(env) {
  const configured = appConfig.ai.provider;
  const name = (env?.AI_PROVIDER || configured || "").trim().toLowerCase();
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
