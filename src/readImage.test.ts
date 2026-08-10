import { afterEach, describe, expect, test, vi } from "vitest";
import { base64FromDataUrl, fitWithin, MAX_EDGE, readImageItems } from "./readImage";

afterEach(() => vi.unstubAllGlobals());

describe("fitWithin — how far a photo has to shrink before upload", () => {
  test("leaves a photo that is already small enough alone", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  test("never enlarges a small photo up to the limit", () => {
    expect(fitWithin(320, 240, 1600)).toEqual({ width: 320, height: 240 });
  });

  test("shrinks a landscape phone photo by its long edge", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  test("shrinks a portrait phone photo by its long edge", () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  test("returns whole pixels", () => {
    const { width, height } = fitWithin(4001, 3000, 1600);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  test("never collapses a very wide photo to zero height", () => {
    expect(fitWithin(6400, 2, 1600).height).toBeGreaterThanOrEqual(1);
  });

  test("keeps the default limit big enough to read handwriting", () => {
    // Gemini reads the image in tiles; below roughly a thousand pixels on the
    // long edge, pencil digits on a ruled slip start to go.
    expect(MAX_EDGE).toBeGreaterThanOrEqual(1024);
  });
});

describe("reading an image with no signal", () => {
  test("says it needs a connection rather than failing obscurely", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    await expect(readImageItems(new File([], "slip.jpg"))).rejects.toThrow(
      /internet|offline|connection/i
    );
  });
});

describe("base64FromDataUrl — a malformed data URL says so (PI-6)", () => {
  test("returns the payload of a well-formed data URL", () => {
    expect(base64FromDataUrl("data:image/jpeg;base64,AAAABBBB")).toBe("AAAABBBB");
  });

  test("keeps commas inside the payload", () => {
    expect(base64FromDataUrl("data:image/jpeg;base64,AA,BB")).toBe("AA,BB");
  });

  // The whole point: these used to yield `undefined`, which travelled into the
  // POST body and made the worker complain about a missing image instead.
  test("throws a readable error when there is no comma", () => {
    expect(() => base64FromDataUrl("not a data url")).toThrow(/expected format/i);
  });

  test("throws when the payload is empty", () => {
    expect(() => base64FromDataUrl("data:image/jpeg;base64,")).toThrow(/empty/i);
    expect(() => base64FromDataUrl("")).toThrow(/empty/i);
  });

  test("throws when handed something that is not a string at all", () => {
    expect(() => base64FromDataUrl(null)).toThrow(/empty/i);
    expect(() => base64FromDataUrl(new ArrayBuffer(8))).toThrow(/empty/i);
  });

  test("never returns undefined", () => {
    for (const bad of ["", "nope", null, undefined, 42]) {
      let out: unknown;
      try {
        out = base64FromDataUrl(bad);
      } catch {
        out = "threw";
      }
      expect(out).not.toBeUndefined();
    }
  });
});
