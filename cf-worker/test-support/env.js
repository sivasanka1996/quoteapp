// Worker test environments, built in one place.
//
// WHY THIS EXISTS — read before adding an inline `{ ... }` env to a test.
//
// The worker tests used to spell out `{ GEMINI_API_KEY: "test-key", ... }` at a
// dozen separate sites, and several of them never named a provider at all. They
// passed because the *ambient* default happened to be Gemini. When
// `config/app.config.ts` switched `ai.provider` to "openrouter", twenty tests
// broke — tests about schema shape, escalation and confidence, none of which
// were about the provider. They had been asserting on a value nobody had asked
// them to depend on.
//
// The rule that came out of it: **a test states the environment it needs; it
// never inherits one.** These factories are how it states it. Everything is
// explicit, and it is defined here rather than repeated down the file, so
// changing what a "Gemini test environment" means is one edit.
//
// Silent by default — the worker writes a structured log line per request, and
// 50 tests' worth of that buries the actual failure. Opt back in with `loud()`
// when the log IS the thing under test.

/** The stand-in key. Never a real one — every test stubs `fetch`. */
export const TEST_KEY = "test-key";

/** Pins Gemini. Use for anything about Flash → Pro, schema, or confidence. */
export function geminiEnv(overrides = {}) {
  return {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: TEST_KEY,
    LOG_LEVEL: "silent",
    ...overrides,
  };
}

/** Pins OpenRouter. */
export function openrouterEnv(overrides = {}) {
  return {
    AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: TEST_KEY,
    LOG_LEVEL: "silent",
    ...overrides,
  };
}

/**
 * Deliberately sets no AI_PROVIDER, so `config/app.config.ts` decides.
 *
 * Only for the tests that are *about* that fallback. Everything else should
 * pin a provider — that is the whole point of this file.
 */
export function configuredByFileEnv(overrides = {}) {
  return {
    GEMINI_API_KEY: TEST_KEY,
    OPENROUTER_API_KEY: TEST_KEY,
    LOG_LEVEL: "silent",
    ...overrides,
  };
}

/**
 * A provider pinned, but its key missing — for the "secret not set" paths.
 * The *other* provider's key is present, to prove the check is per-provider
 * and not just "is any key set".
 */
export function missingKeyEnv(provider) {
  return provider === "gemini"
    ? { AI_PROVIDER: "gemini", OPENROUTER_API_KEY: TEST_KEY, LOG_LEVEL: "silent" }
    : { AI_PROVIDER: "openrouter", GEMINI_API_KEY: TEST_KEY, LOG_LEVEL: "silent" };
}

/** Un-silence, for tests that assert on the structured log itself. */
export function loud(env) {
  const { LOG_LEVEL, ...rest } = env;
  void LOG_LEVEL;
  return rest;
}
