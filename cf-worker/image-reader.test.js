import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "./image-reader.js";

// AI_PROVIDER is pinned rather than inherited. The default now lives in
// config/app.config.ts (currently "openrouter"), and a test of Gemini's
// Flash → Pro behaviour should say which provider it means — otherwise
// editing the config file silently repoints the whole suite.
//
// LOG_LEVEL silent keeps the structured request log out of the test output.
// The logging tests below pass their own env to exercise it deliberately.
const ENV = { GEMINI_API_KEY: "test-key", AI_PROVIDER: "gemini", LOG_LEVEL: "silent" };
const LOUD_ENV = { GEMINI_API_KEY: "test-key", AI_PROVIDER: "gemini" };

/** The origin the live app actually calls from. */
const APP_ORIGIN = "https://quoteapp-3f48e.web.app";

function post(body = { imageBase64: "AAAA", mimeType: "image/jpeg" }, origin = APP_ORIGIN) {
  return new Request("https://worker.test/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Stub Gemini. `replies` answers generateContent calls in order; each entry is
 * either a plain object (sent back as 200 JSON) or a function returning a
 * Response, so a test can simulate an HTTP error or a network throw.
 * Returns the list of calls made, for asserting on what we asked Gemini for.
 */
function stubGemini(...replies) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, opts) => {
    const reply = replies[calls.length];
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    if (reply === undefined) throw new Error("Gemini called more times than the test allows");
    if (typeof reply === "function") return reply();
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  return calls;
}

/** A successful Gemini generateContent envelope carrying `text`. */
function geminiText(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

/** A successful Gemini reply carrying `items` as schema-shaped JSON. */
function geminiItems(items) {
  return geminiText(JSON.stringify(items));
}

afterEach(() => vi.unstubAllGlobals());

describe("asking Gemini for structured output", () => {
  test("constrains the reply to JSON with a response schema", async () => {
    const calls = stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await worker.fetch(post(), ENV);

    const cfg = calls[0].body.generationConfig;
    expect(cfg.responseMimeType).toBe("application/json");
    expect(cfg.responseSchema.items.properties).toHaveProperty("name");
    expect(cfg.responseSchema.items.properties).toHaveProperty("qty");
    expect(cfg.responseSchema.items.properties).toHaveProperty("rate");
  });

  test("returns the items Gemini sends back", async () => {
    stubGemini(geminiItems([
      { name: "2.5 sq wire", qty: 3, rate: 1650 },
      { name: "6A MCB", qty: 10, rate: null },
    ]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.items).toEqual([
      { name: "2.5 sq wire", qty: 3, rate: 1650 },
      { name: "6A MCB", qty: 10, rate: null },
    ]);
  });

  test("keeps a fractional quantity fractional", async () => {
    stubGemini(geminiItems([{ name: "Cable", qty: 2.5, rate: 48 }]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.items[0].qty).toBe(2.5);
  });

  test("drops an item with no name rather than adding a blank row", async () => {
    stubGemini(geminiItems([
      { name: "  ", qty: 1, rate: 10 },
      { name: "Socket", qty: 4, rate: 55 },
    ]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.items).toEqual([{ name: "Socket", qty: 4, rate: 55 }]);
  });

  test("reports a missing rate as null rather than zero", async () => {
    stubGemini(geminiItems([{ name: "Lug", qty: 6 }]));

    const body = await (await worker.fetch(post(), ENV)).json();

    // A rate of 0 would price the line at zero and look deliberate. null makes
    // the confirm list show an empty field Dad has to fill in.
    expect(body.items[0].rate).toBeNull();
  });
});

describe("escalating to Pro on retry only", () => {
  test("does not call Pro when Flash reads the list", async () => {
    const calls = stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await worker.fetch(post(), ENV);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("gemini-2.5-flash");
  });

  test("retries on Pro when Flash finds nothing", async () => {
    const calls = stubGemini(
      geminiItems([]),
      geminiItems([{ name: "6A MCB", qty: 10, rate: 120 }])
    );

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("gemini-2.5-pro");
    expect(body.items).toEqual([{ name: "6A MCB", qty: 10, rate: 120 }]);
  });

  test("retries on Pro when Flash errors instead of failing the read", async () => {
    stubGemini(
      () => new Response("rate limited", { status: 429 }),
      geminiItems([{ name: "Socket", qty: 4, rate: 55 }])
    );

    const res = await worker.fetch(post(), ENV);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([{ name: "Socket", qty: 4, rate: 55 }]);
  });

  test("retries on Pro when the Flash request throws", async () => {
    stubGemini(
      () => { throw new Error("network down"); },
      geminiItems([{ name: "Fan", qty: 1, rate: 1400 }])
    );

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.items).toEqual([{ name: "Fan", qty: 1, rate: 1400 }]);
  });

  test("tries Pro once, not repeatedly", async () => {
    const calls = stubGemini(geminiItems([]), geminiItems([]));

    await worker.fetch(post(), ENV);

    expect(calls).toHaveLength(2);
  });

  test("gives up with a note Dad can act on when both models find nothing", async () => {
    stubGemini(geminiItems([]), geminiItems([]));

    const res = await worker.fetch(post(), ENV);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.confidence).toBe("low");
    expect(body.notes).toMatch(/photo/i);
  });

  test("keeps the technical reason out of the note but still reports it", async () => {
    stubGemini(
      () => new Response("quota", { status: 429 }),
      () => new Response("quota", { status: 429 })
    );

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.notes).not.toMatch(/429/);
    expect(body.detail).toMatch(/429/);
  });
});

describe("confidence reports what was actually read", () => {
  test("is full when every item has a quantity and a rate", async () => {
    stubGemini(geminiItems([
      { name: "Wire", qty: 2, rate: 100 },
      { name: "Socket", qty: 4, rate: 55 },
    ]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.confidence).toBe("full");
  });

  test("is partial when an item came back with no rate", async () => {
    stubGemini(geminiItems([
      { name: "Wire", qty: 2, rate: 100 },
      { name: "Lug", qty: 6, rate: null },
    ]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.confidence).toBe("partial");
  });

  test("is partial when an item came back with no quantity", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 0, rate: 100 }]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.confidence).toBe("partial");
  });

  test("is low when nothing was read", async () => {
    stubGemini(geminiItems([]), geminiItems([]));

    const body = await (await worker.fetch(post(), ENV)).json();

    expect(body.confidence).toBe("low");
  });
});

describe("only the app may spend the Gemini key", () => {
  function options(origin) {
    return new Request("https://worker.test/", {
      method: "OPTIONS",
      headers: origin ? { Origin: origin } : {},
    });
  }

  test("answers the app's own origin rather than a wildcard", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    const res = await worker.fetch(post(), ENV);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });

  test("allows the dev server, so npm run dev still reads photos", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    const res = await worker.fetch(post(undefined, "http://localhost:5173"), ENV);

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  test("refuses a page that is not the app, without calling Gemini", async () => {
    const calls = stubGemini();

    const res = await worker.fetch(post(undefined, "https://not-the-app.example"), ENV);

    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  // The whole point of the exercise. A script has to be *told* to send an
  // Origin; a browser always does. Refusing the blank case is what stops the
  // worker being a free Gemini relay for anyone who reads the public repo.
  test("refuses a request that sends no origin at all, without calling Gemini", async () => {
    const calls = stubGemini();

    const res = await worker.fetch(post(undefined, null), ENV);

    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  test("never reflects an origin it has refused", async () => {
    stubGemini();

    const res = await worker.fetch(post(undefined, "https://not-the-app.example"), ENV);

    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("https://not-the-app.example");
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });

  test("lets the browser preflight from the app", async () => {
    const res = await worker.fetch(options(APP_ORIGIN), ENV);

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
  });

  test("refuses to preflight from anywhere else", async () => {
    const res = await worker.fetch(options("https://not-the-app.example"), ENV);

    expect(res.status).toBe(403);
  });

  test("keeps the model-list endpoint behind the same check", async () => {
    const calls = stubGemini();
    const req = new Request("https://worker.test/list", {
      headers: { Origin: "https://not-the-app.example" },
    });

    const res = await worker.fetch(req, ENV);

    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  test("tells caches the answer depends on the origin", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    const res = await worker.fetch(post(), ENV);

    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

describe("logging", () => {
  /** Capture the worker's structured stdout lines as parsed objects. */
  function captureLog() {
    const lines = [];
    vi.stubGlobal("console", {
      ...console,
      log: (s) => {
        try {
          lines.push(JSON.parse(s));
        } catch {
          lines.push({ raw: s });
        }
      },
    });
    return lines;
  }

  test("writes one structured line per read, with the fields worth grepping", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    await worker.fetch(post(), LOUD_ENV);

    const done = lines.find((l) => l.msg === "read complete");
    expect(done).toBeTruthy();
    expect(done.provider).toBe("gemini");
    expect(done.model).toBe("gemini-2.5-flash");
    expect(done.itemCount).toBe(1);
    expect(done.confidence).toBe("full");
    expect(typeof done.ms).toBe("number");
    expect(typeof done.rid).toBe("string");
  });

  test("ties every line of one request to the same id", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    await worker.fetch(post(), LOUD_ENV);

    const ids = new Set(lines.filter((l) => l.rid).map((l) => l.rid));
    expect(ids.size).toBe(1);
  });

  test("records the escalation to Pro", async () => {
    stubGemini(geminiItems([]), geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    await worker.fetch(post(), LOUD_ENV);

    const attempts = lines.filter((l) => l.msg === "model attempt");
    expect(attempts.map((a) => a.model)).toEqual([
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
    expect(attempts[0].level).toBe("warn");
    expect(attempts[1].level).toBe("info");
  });

  test("notes a refused origin", async () => {
    stubGemini();
    const lines = captureLog();

    await worker.fetch(post(undefined, "https://not-the-app.example"), LOUD_ENV);

    const refused = lines.find((l) => l.msg === "origin refused");
    expect(refused.origin).toBe("https://not-the-app.example");
  });

  test("says nothing at all when silenced", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    await worker.fetch(post(), ENV);

    expect(lines).toHaveLength(0);
  });

  // The /list branch awaits fetch without its own guard, so a network throw
  // there reaches the top-level handler — the exact case the outer catch is for.
  test("never leaks a stack trace to the client", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("boom at internal.js:42");
    });
    const lines = captureLog();
    const req = new Request("https://worker.test/list", {
      headers: { Origin: APP_ORIGIN },
    });

    const res = await worker.fetch(req, LOUD_ENV);
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      error: "Image reading failed. Please try again.",
    });
    expect(body).not.toContain("internal.js");
    expect(body).not.toContain("boom");
    // …but the worker's own log keeps the full detail.
    const logged = lines.find((l) => l.msg === "unhandled worker error");
    expect(logged.err).toContain("boom");
  });
});

describe("choosing a provider with AI_PROVIDER (PI-7)", () => {
  function captureLog() {
    const lines = [];
    vi.stubGlobal("console", {
      ...console,
      log: (s) => {
        try {
          lines.push(JSON.parse(s));
        } catch {
          lines.push({ raw: s });
        }
      },
    });
    return lines;
  }

  // With no AI_PROVIDER env var the config file decides. It currently says
  // openrouter, so that is what an unconfigured worker uses.
  test("falls back to the config file when no env var is set", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ items: [{ name: "Wire", qty: 2, rate: 100 }] }) } }],
      }), { status: 200 });
    });

    await worker.fetch(post(), { LOG_LEVEL: "silent", OPENROUTER_API_KEY: "or-key" });

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  // …and an env var beats it, which is the no-deploy rollback path.
  test("an env var overrides the config file", async () => {
    const calls = stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await worker.fetch(post(), { ...ENV, AI_PROVIDER: "gemini" });

    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });

  test("routes to OpenRouter when asked", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ items: [{ name: "Wire", qty: 2, rate: 100 }] }) } },
          ],
        }),
        { status: 200 }
      );
    });

    const body = await (
      await worker.fetch(post(), {
        ...ENV,
        AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "or-key",
      })
    ).json();

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.items).toEqual([{ name: "Wire", qty: 2, rate: 100 }]);
    expect(body.confidence).toBe("full");
  });

  test("is not case-sensitive about the name", async () => {
    const calls = stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await worker.fetch(post(), { ...ENV, AI_PROVIDER: "GEMINI" });

    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });

  // A typo in an env var must never be why Dad cannot read a slip in a shop.
  test("falls back to Gemini on an unknown name, and says so", async () => {
    const calls = stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    const res = await worker.fetch(post(), { ...LOUD_ENV, AI_PROVIDER: "gemeni" });

    expect(res.status).toBe(200);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
    const warned = lines.find((l) => l.msg === "unknown AI_PROVIDER, falling back");
    expect(warned.requested).toBe("gemeni");
    expect(warned.using).toBe("gemini");
  });

  test("reports the chosen provider's missing key, not the other one's", async () => {
    stubGemini();

    const body = await (
      await worker.fetch(post(), { LOG_LEVEL: "silent", AI_PROVIDER: "openrouter" })
    ).json();

    expect(body.error).toMatch(/OPENROUTER_API_KEY/);
  });

  test("still refuses a request with no Gemini key on the Gemini path", async () => {
    stubGemini();

    const res = await worker.fetch(post(), { LOG_LEVEL: "silent", AI_PROVIDER: "gemini" });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/GEMINI_API_KEY/);
  });

  test("names the provider in the completion log", async () => {
    stubGemini(geminiItems([{ name: "Wire", qty: 2, rate: 100 }]));
    const lines = captureLog();

    await worker.fetch(post(), LOUD_ENV);

    expect(lines.find((l) => l.msg === "read complete").provider).toBe("gemini");
  });
});
