import { describe, it, expect } from "vitest";
import { formatINR, formatINRShort } from "./format";

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

describe("formatINRShort — compact stat tiles", () => {
  it("abbreviates lakhs", () => {
    expect(formatINRShort(240000)).toBe("2.4L");
    expect(formatINRShort(100000)).toBe("1L");
    expect(formatINRShort(1150000)).toBe("11.5L");
  });
  it("abbreviates crores", () => {
    expect(formatINRShort(12500000)).toBe("1.3Cr");
    expect(formatINRShort(10000000)).toBe("1Cr");
  });
  it("falls back to full grouping below a lakh", () => {
    expect(formatINRShort(99999)).toBe("99,999");
    expect(formatINRShort(0)).toBe("0");
  });
  it("keeps the sign", () => {
    expect(formatINRShort(-240000)).toBe("-2.4L");
  });
});
