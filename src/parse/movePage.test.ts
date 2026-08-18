import { describe, it, expect } from "vitest";
import { movePage } from "./movePage";

describe("movePage", () => {
  const pages = ["a", "b", "c"];

  it("moves an item later", () => {
    expect(movePage(pages, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves an item earlier", () => {
    expect(movePage(pages, 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input", () => {
    const src = ["a", "b", "c"];
    movePage(src, 0, 2);
    expect(src).toEqual(["a", "b", "c"]);
  });

  it("refuses a move off the front", () => {
    expect(movePage(pages, 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("refuses a move off the end", () => {
    expect(movePage(pages, 2, 3)).toEqual(["a", "b", "c"]);
  });

  it("refuses a move from an index that does not exist", () => {
    expect(movePage(pages, 5, 0)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when from and to are the same", () => {
    expect(movePage(pages, 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list", () => {
    expect(movePage([], 0, 1)).toEqual([]);
  });
});
