import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "./image-reader.js";

const ENV = { GEMINI_API_KEY: "test-key" };

function post(body = { imageBase64: "AAAA", mimeType: "image/jpeg" }) {
  return new Request("https://worker.test/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
