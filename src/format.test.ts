import { describe, it, expect } from "vitest";
import { formatINR } from "./format";

describe("formatINR — Indian grouping", () => {
  it("formats crore-sized numbers", () => {
    expect(formatINR(10223096)).toBe("1,02,23,096");
    expect(formatINR(10596256)).toBe("1,05,96,256");
    expect(formatINR(12502874)).toBe("1,25,02,874");
  });
  it("formats lakh-sized numbers", () => {
    expect(formatINR(373347)).toBe("3,73,347");
    expect(formatINR(100000)).toBe("1,00,000");
  });
  it("formats small numbers", () => {
    expect(formatINR(402)).toBe("402");
    expect(formatINR(6296)).toBe("6,296");
  });
  it("handles decimals", () => {
    expect(formatINR(6169.84, 2)).toBe("6,169.84");
    expect(formatINR(25253.62, 2)).toBe("25,253.62");
  });
  it("handles negatives", () => {
    expect(formatINR(-373347)).toBe("-3,73,347");
  });
});
