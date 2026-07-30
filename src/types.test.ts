import { describe, it, expect } from "vitest";
import { quoteStatus, type QuoteDoc } from "./types";

function quote(partial: Partial<QuoteDoc>): QuoteDoc {
  return {
    id: "q1",
    customerId: "c1",
    customerName: "Anjene Guntur",
    name: "Test quote",
    lines: [],
    totalSale: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("quoteStatus", () => {
  it("returns the stored status", () => {
    expect(quoteStatus(quote({ status: "accepted" }))).toBe("accepted");
    expect(quoteStatus(quote({ status: "declined" }))).toBe("declined");
  });

  it("treats quotes saved before the field existed as drafts", () => {
    expect(quoteStatus(quote({}))).toBe("draft");
    expect(quoteStatus(quote({ status: undefined }))).toBe("draft");
  });
});
