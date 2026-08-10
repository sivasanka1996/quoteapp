import { afterEach, describe, expect, test, vi } from "vitest";
import { read, id, missingKey, DEFAULT_MODEL } from "./openrouter.js";

const ENV = { OPENROUTER_API_KEY: "test-key", LOG_LEVEL: "silent" };

/**
 * Stub OpenRouter. Each reply is either a plain object (200 JSON) or a
 * function returning a Response, so a test can simulate an HTTP error or a
 * network throw. Returns the calls made, for asserting on the request.
 */
function stubOpenRouter(...replies) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, opts) => {
    const reply = replies[calls.length];
    calls.push({
      url: String(url),
      headers: opts.headers,
      body: JSON.parse(opts.body),
    });
    if (reply === undefined) throw new Error("called more times than allowed");
    if (typeof reply === "function") return reply();
    return new Response(JSON.stringify(reply), { status: 200 });
  });
  return calls;
}

/** An OpenAI-shaped chat completion carrying `content`. */
function completion(content) {
  return { choices: [{ message: { content } }] };
}

/** A completion carrying the wrapped item list the schema asks for. */
function completionItems(items) {
  return completion(JSON.stringify({ items }));
}

afterEach(() => vi.unstubAllGlobals());

describe("identity and configuration", () => {
  test("is named openrouter", () => {
    expect(id).toBe("openrouter");
  });

  test("opens on the cheapest vision-plus-structured-output model", () => {
    expect(DEFAULT_MODEL).toBe("qwen/qwen3.5-flash-02-23");
  });

  test("reports a missing key rather than calling out with none", () => {
    expect(missingKey({})).toMatch(/OPENROUTER_API_KEY/);
    expect(missingKey({ OPENROUTER_API_KEY: "k" })).toBeNull();
  });
});

describe("the request", () => {
  test("posts to the chat completions endpoint with the key", async () => {
    const calls = stubOpenRouter(completionItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].headers.Authorization).toBe("Bearer test-key");
  });

  test("carries the model, defaulting when none is configured", async () => {
    const calls = stubOpenRouter(completionItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(calls[0].body.model).toBe(DEFAULT_MODEL);
  });

  // The whole reason the provider layer exists: changing model must not need a
  // deploy (spec §4.3).
  test("takes the model from the environment when set", async () => {
    const calls = stubOpenRouter(completionItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await read("AAAA", "image/jpeg", { ...ENV, OPENROUTER_MODEL: "qwen/qwen3.6-flash" }, "rid1");

    expect(calls[0].body.model).toBe("qwen/qwen3.6-flash");
  });

  test("sends the image as a base64 data URL part", async () => {
    const calls = stubOpenRouter(completionItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await read("AAAA", "image/png", ENV, "rid1");

    const parts = calls[0].body.messages[0].content;
    const image = parts.find((p) => p.type === "image_url");
    expect(image.image_url.url).toBe("data:image/png;base64,AAAA");
    expect(parts.find((p) => p.type === "text").text).toMatch(/electrical materials/i);
  });

  test("asks for structured output, not prose", async () => {
    const calls = stubOpenRouter(completionItems([{ name: "Wire", qty: 2, rate: 100 }]));

    await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(calls[0].body.response_format.type).toBe("json_schema");
    const schema = calls[0].body.response_format.json_schema.schema;
    expect(schema.properties.items.items.properties).toHaveProperty("name");
    expect(schema.properties.items.items.properties).toHaveProperty("qty");
    expect(schema.properties.items.items.properties).toHaveProperty("rate");
  });
});

describe("the reply", () => {
  test("returns the items it was given", async () => {
    stubOpenRouter(completionItems([
      { name: "2.5 sq wire", qty: 3, rate: 1650 },
      { name: "6A MCB", qty: 10, rate: null },
    ]));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([
      { name: "2.5 sq wire", qty: 3, rate: 1650 },
      { name: "6A MCB", qty: 10, rate: null },
    ]);
    expect(out.detail).toBe("");
  });

  test("normalises exactly as the Gemini path does", async () => {
    stubOpenRouter(completionItems([
      { name: "  ", qty: 1, rate: 10 },
      { name: "Lug", qty: 6 },
      { name: "Cable", qty: 2.5, rate: 48 },
    ]));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    // Blank name dropped, missing rate stays null (never 0), fraction kept.
    expect(out.items).toEqual([
      { name: "Lug", qty: 6, rate: null },
      { name: "Cable", qty: 2.5, rate: 48 },
    ]);
  });

  test("accepts a bare array as well as the wrapped object", async () => {
    stubOpenRouter(completion(JSON.stringify([{ name: "Wire", qty: 2, rate: 100 }])));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([{ name: "Wire", qty: 2, rate: 100 }]);
  });
});

// The contract, and the reason the router needs no try/catch (spec §4.2).
describe("never throws — failure is an empty list with a detail", () => {
  test("on malformed JSON", async () => {
    stubOpenRouter(completion("I could not read this slip, sorry!"));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([]);
    expect(out.detail).toBeTruthy();
  });

  test("on an empty reply", async () => {
    stubOpenRouter({ choices: [] });

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([]);
    expect(out.detail).toMatch(/no reading/i);
  });

  test("on HTTP 429, reporting the status in detail", async () => {
    stubOpenRouter(() => new Response("rate limited", { status: 429 }));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([]);
    expect(out.detail).toMatch(/429/);
  });

  test("on a network throw", async () => {
    stubOpenRouter(() => {
      throw new Error("network down");
    });

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([]);
    expect(out.detail).toMatch(/network down/);
  });

  test("on a reply that is valid JSON but the wrong shape", async () => {
    stubOpenRouter(completion(JSON.stringify({ nope: true })));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.items).toEqual([]);
  });

  test("always names the model it used, even on failure", async () => {
    stubOpenRouter(() => new Response("nope", { status: 500 }));

    const out = await read("AAAA", "image/jpeg", ENV, "rid1");

    expect(out.model).toBe(DEFAULT_MODEL);
  });
});
