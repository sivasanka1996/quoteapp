import { afterEach, describe, expect, test, vi } from "vitest";
import { fitWithin, MAX_EDGE, readImageItems } from "./readImage";

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
