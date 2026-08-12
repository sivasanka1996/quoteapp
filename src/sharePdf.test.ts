import { describe, expect, test } from "vitest";
import { pageSlices, pdfFilename } from "./sharePdf";

/**
 * Where a tall quotation gets cut into pages.
 *
 * Proved necessary by `scripts/pdf-check.ts` on 2026-08-12: a 20-item quote
 * produced a 2-page PDF whose break fell at canvas y=2204, straight through
 * item 12. The row's name sat on page 1 and the rest of the same row on page 2,
 * both halves sliced through the middle of the glyphs. Nothing was lost, but it
 * is the document the customer receives.
 */
describe("pageSlices", () => {
  test("returns one slice when everything fits", () => {
    expect(pageSlices(500, 800, [])).toEqual([500]);
  });

  // The old behaviour, preserved exactly: with nothing to align to, fill each
  // page and let the last one be short.
  test("falls back to even bands when there is nothing to align to", () => {
    expect(pageSlices(2500, 1000, [])).toEqual([1000, 1000, 500]);
  });

  test("cuts at the last row boundary that still fits on the page", () => {
    // Rows every 300px; a page holds 1000px, so the last boundary at or before
    // 1000 is 900.
    const rows = [300, 600, 900, 1200, 1500];
    expect(pageSlices(1500, 1000, rows)).toEqual([900, 600]);
  });

  test("never cuts through a row when a boundary is available", () => {
    const rows = [250, 500, 750, 1000, 1250, 1500, 1750, 2000];
    const slices = pageSlices(2000, 800, rows);
    let y = 0;
    for (const h of slices.slice(0, -1)) {
      y += h;
      expect(rows).toContain(y);
    }
  });

  test("always adds up to the whole document, so no row is dropped", () => {
    const rows = [140, 517, 890, 1263, 1636, 2009];
    for (const max of [400, 700, 1000, 2500]) {
      const slices = pageSlices(2009, max, rows);
      expect(slices.reduce((a, b) => a + b, 0)).toBe(2009);
      expect(slices.every((h) => h > 0)).toBe(true);
    }
  });

  // A single row taller than a page has no honest break. Cutting it is the
  // only option; hanging is not.
  test("hard-cuts a row taller than one page rather than looping forever", () => {
    expect(pageSlices(1000, 400, [950])).toEqual([400, 400, 200]);
  });

  test("ignores boundaries outside the remaining document", () => {
    expect(pageSlices(1000, 600, [-50, 0, 1500, 9000])).toEqual([600, 400]);
  });

  test("a degenerate page height cannot hang the share", () => {
    expect(pageSlices(500, 0, [])).toEqual([500]);
    expect(pageSlices(0, 100, [])).toEqual([]);
  });
});

describe("pdfFilename", () => {
  test("slugs the customer and quote name", () => {
    expect(pdfFilename("Anjene Guntur", "Rice & Pulses")).toBe("Anjene-Guntur-Rice-Pulses.pdf");
  });

  test("falls back when there is nothing usable", () => {
    expect(pdfFilename("", "")).toBe("quotation.pdf");
  });
});
