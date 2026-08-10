import { describe, it, expect } from "vitest";
import { mergePages, type PageResult } from "./mergePages";

const ok = (...names: string[]): PageResult => ({
  ok: true,
  items: names.map((name, i) => ({ name, qty: i + 1, rate: 100 })),
});

const failed = (error = "could not read"): PageResult => ({ ok: false, error });

describe("mergePages", () => {
  it("keeps page order, and item order within a page", () => {
    const merged = mergePages([ok("a", "b"), ok("c"), ok("d", "e")]);

    expect(merged.items.map((i) => i.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(merged.failed).toEqual([]);
  });

  it("badges each item with its 1-based page", () => {
    const merged = mergePages([ok("a", "b"), ok("c")]);

    expect(merged.items.map((i) => i.page)).toEqual([1, 1, 2]);
  });

  it("carries the item fields through untouched", () => {
    const merged = mergePages([
      { ok: true, items: [{ name: "2.5 sq wire", qty: 2.5, rate: null }] },
    ]);

    expect(merged.items[0]).toEqual({
      name: "2.5 sq wire",
      qty: 2.5,
      rate: null,
      page: 1,
    });
  });

  // Spec §5.3: losing the whole batch to one bad photo is the failure Dad
  // would actually hit, standing in a shop.
  it("keeps the good pages when one fails", () => {
    const merged = mergePages([ok("a"), failed(), ok("c")]);

    expect(merged.items.map((i) => i.name)).toEqual(["a", "c"]);
    expect(merged.failed).toEqual([2]);
  });

  it("numbers the failed pages the way Dad counts them, from 1", () => {
    const merged = mergePages([failed(), ok("b"), failed()]);

    expect(merged.failed).toEqual([1, 3]);
    expect(merged.items.map((i) => i.page)).toEqual([2]);
  });

  it("reports every page failing without losing the count", () => {
    const merged = mergePages([failed(), failed()]);

    expect(merged.items).toEqual([]);
    expect(merged.failed).toEqual([1, 2]);
  });

  it("treats a page that read nothing as read, not failed", () => {
    // An empty slip is a different thing from a photo that could not be read,
    // and only the second one is worth offering a retry for.
    const merged = mergePages([ok(), ok("b")]);

    expect(merged.failed).toEqual([]);
    expect(merged.items.map((i) => i.name)).toEqual(["b"]);
  });

  it("handles no pages at all", () => {
    expect(mergePages([])).toEqual({ items: [], failed: [] });
  });

  it("survives a malformed page rather than throwing", () => {
    const merged = mergePages([
      ok("a"),
      { ok: true, items: null as unknown as [] },
    ]);

    expect(merged.items.map((i) => i.name)).toEqual(["a"]);
    expect(merged.failed).toEqual([2]);
  });
});
