import { describe, it, expect } from "vitest";
import {
  parseDiscountChain,
  applyDiscountChain,
  resolvePrice,
  calcLine,
  calcQuote,
} from "./engine";

// ============================================================
// VERIFICATION FIXTURE — wire quote from screenshots
// Cost side: "64.7% + 2%" (compounding), GST 18%
// Customer side: direct rates
//
// KNOWN FIXTURE DISCREPANCIES (see rounding note in spec):
//
//   Cost side (tunable — confirm rounding sequence with Siva):
//     Fixture says cost/unit for 2.5sq = 10,211.40
//     Our calculation:  29515 × 0.353 × 0.98 = 10,210.42
//     Fixture says totalCost = 1,02,23,096; we produce 1,02,22,309 (~₹787 off)
//
//   Sale side (apparent transcription error in 1.5sq row):
//     Fixture says 6,296 × 402 = 25,31,592 — but 6296 × 402 = 25,30,992
//     We use our correct arithmetic; the other 3 sale lines match exactly.
//
// All tests below reflect our engine's correct output, not the fixture verbatim.
// Profit %s (3.65% / 3.52%) match regardless.
// ============================================================

const FIXTURE_LINES = [
  { name: "1.5 sq", qty: 402, listPrice: 17835, custRate: 6296 },
  { name: "2.5 sq", qty: 396, listPrice: 29515, custRate: 10451 },
  { name: "4 sq",   qty: 208, listPrice: 30345, custRate: 10786 },
  { name: "10 sq",  qty: 60,  listPrice: 73000, custRate: 28043 },
];

const COST_DISCOUNT_EXPR = "64.7% + 2%";

describe("parseDiscountChain", () => {
  it("parses a two-slab chain", () => {
    const chain = parseDiscountChain("64.7% + 2%");
    expect(chain).toHaveLength(2);
    expect(chain[0]).toBeCloseTo(0.647);
    expect(chain[1]).toBeCloseTo(0.02);
  });

  it("parses a single discount", () => {
    const chain = parseDiscountChain("30%");
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBeCloseTo(0.3);
  });

  it("parses a three-slab chain", () => {
    const chain = parseDiscountChain("50% + 10% + 5%");
    expect(chain).toHaveLength(3);
  });
});

describe("applyDiscountChain — compounds, does NOT add", () => {
  it("17835 × (1−0.647) × (1−0.02) ≈ 6169.84", () => {
    const discounts = parseDiscountChain(COST_DISCOUNT_EXPR);
    const raw = applyDiscountChain(17835, discounts);
    expect(raw).toBeCloseTo(6169.84, 1);
  });

  it("does NOT additively combine: 64.7+2 ≠ 66.7%", () => {
    const additive = 17835 * (1 - 0.667);
    const compound = applyDiscountChain(17835, [0.647, 0.02]);
    expect(compound).not.toBeCloseTo(additive, 0);
  });
});

describe("resolvePrice — cost/unit values (round to 2dp)", () => {
  it("1.5sq cost: 17835 × 0.353 × 0.98 = 6169.84  ✓ matches fixture", () => {
    const result = resolvePrice({ kind: "discount", listPrice: 17835, discountExpr: COST_DISCOUNT_EXPR });
    expect(result).toBe(6169.84);
  });

  it("2.5sq cost: 29515 × 0.353 × 0.98 = 10210.42  (fixture shows 10211.40 — rounding sequence TBD)", () => {
    const result = resolvePrice({ kind: "discount", listPrice: 29515, discountExpr: COST_DISCOUNT_EXPR });
    expect(result).toBe(10210.42);
  });

  it("4sq cost: 30345 × 0.353 × 0.98 = 10497.55  ✓ matches fixture", () => {
    const result = resolvePrice({ kind: "discount", listPrice: 30345, discountExpr: COST_DISCOUNT_EXPR });
    expect(result).toBe(10497.55);
  });

  it("10sq cost: 73000 × 0.353 × 0.98 = 25253.62  ✓ matches fixture", () => {
    const result = resolvePrice({ kind: "discount", listPrice: 73000, discountExpr: COST_DISCOUNT_EXPR });
    expect(result).toBe(25253.62);
  });

  it("direct rate returns the rate unchanged", () => {
    expect(resolvePrice({ kind: "direct", rate: 6296 })).toBe(6296);
  });
});

describe("calcLine — per-line totals", () => {
  it("1.5sq: cost/unit 6169.84, costTotal 24,80,276, saleTotal 25,30,992", () => {
    const result = calcLine({
      name: "1.5 sq", qty: 402,
      cost: { kind: "discount", listPrice: 17835, discountExpr: COST_DISCOUNT_EXPR },
      sell: { kind: "direct", rate: 6296 },
      gstPct: 18,
    });
    expect(result.resolvedCost).toBe(6169.84);
    expect(result.lineCostTotal).toBe(2480276);  // 6169.84 × 402 = 2,480,275.68 → 2,480,276
    expect(result.lineSaleTotal).toBe(2530992);  // 6296 × 402 = 2,530,992  (fixture shows 25,31,592 — transcription gap)
  });

  it("2.5sq: saleTotal 41,38,596  ✓", () => {
    const result = calcLine({
      name: "2.5 sq", qty: 396,
      cost: { kind: "discount", listPrice: 29515, discountExpr: COST_DISCOUNT_EXPR },
      sell: { kind: "direct", rate: 10451 },
      gstPct: 18,
    });
    expect(result.resolvedCost).toBe(10210.42);
    expect(result.lineSaleTotal).toBe(4138596);  // 10451 × 396 = 4,138,596 ✓
  });

  it("4sq: saleTotal 22,43,488  ✓", () => {
    const result = calcLine({
      name: "4 sq", qty: 208,
      cost: { kind: "discount", listPrice: 30345, discountExpr: COST_DISCOUNT_EXPR },
      sell: { kind: "direct", rate: 10786 },
      gstPct: 18,
    });
    expect(result.resolvedCost).toBe(10497.55);
    expect(result.lineCostTotal).toBe(2183490);  // 10497.55 × 208 = 2,183,490.4 → 2,183,490 ✓
    expect(result.lineSaleTotal).toBe(2243488);  // 10786 × 208 = 2,243,488 ✓
  });

  it("10sq: costTotal 15,15,217  ✓  saleTotal 16,82,580  ✓", () => {
    const result = calcLine({
      name: "10 sq", qty: 60,
      cost: { kind: "discount", listPrice: 73000, discountExpr: COST_DISCOUNT_EXPR },
      sell: { kind: "direct", rate: 28043 },
      gstPct: 18,
    });
    expect(result.resolvedCost).toBe(25253.62);
    expect(result.lineCostTotal).toBe(1515217);  // 25253.62 × 60 = 1,515,217.2 → 1,515,217 ✓
    expect(result.lineSaleTotal).toBe(1682580);  // 28043 × 60 = 1,682,580 ✓
  });
});

describe("calcQuote — full fixture totals", () => {
  const inputs = FIXTURE_LINES.map((l) => ({
    name: l.name,
    qty: l.qty,
    cost: { kind: "discount" as const, listPrice: l.listPrice, discountExpr: COST_DISCOUNT_EXPR },
    sell: { kind: "direct" as const, rate: l.custRate },
    gstPct: 18,
  }));

  const { totals } = calcQuote(inputs);

  it("totalCost 1,02,22,309  (fixture: 1,02,23,096 — cost rounding TBD)", () => {
    expect(totals.totalCost).toBe(10222309);
  });

  it("totalSale 1,05,95,656  (fixture: 1,05,96,256 — 1.5sq transcription gap)", () => {
    expect(totals.totalSale).toBe(10595656);
  });

  it("grossProfit 3,73,347  (fixture: 3,73,160 — follows from cost/sale diffs above)", () => {
    expect(totals.grossProfit).toBe(373347);
  });

  it("profit-on-cost ≈ 3.65%  ✓ matches fixture", () => {
    expect(totals.profitOnCostPct).toBeCloseTo(3.65, 2);
  });

  it("profit-on-sales ≈ 3.52%  ✓ matches fixture", () => {
    expect(totals.profitOnSalesPct).toBeCloseTo(3.52, 2);
  });

  it("totalGst 19,07,218  (fixture: 19,07,326 — follows from sale diff)", () => {
    expect(totals.totalGst).toBe(1907218);
  });

  it("grandTotal 1,25,02,874  (fixture: 1,25,03,582 — follows from sale diff)", () => {
    expect(totals.grandTotal).toBe(12502874);
  });
});
