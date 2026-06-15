// --- Types ---

export type PriceMode =
  | { kind: "discount"; listPrice: number; discountExpr: string }
  | { kind: "direct"; rate: number };

export interface LineInput {
  name: string;
  qty: number;
  cost: PriceMode;
  sell: PriceMode;
  gstPct: number; // default 18
}

export interface LineResult {
  name: string;
  qty: number;
  resolvedCost: number;   // per unit, rounded to 2dp
  resolvedSell: number;   // per unit (direct or discount-resolved)
  lineCostTotal: number;  // round(resolvedCost * qty)
  lineSaleTotal: number;  // round(resolvedSell * qty)
  lineProfit: number;
  gstAmount: number;      // round(lineSaleTotal * gstPct/100)
  lineCustomerTotal: number;
}

export interface QuoteTotals {
  totalCost: number;
  totalSale: number;
  grossProfit: number;
  profitOnCostPct: number;
  profitOnSalesPct: number;
  totalGst: number;
  grandTotal: number;
}

// --- Discount chain parser ---
// Parses "64.7% + 2%" into [0.647, 0.02].
// Supports any number of chained discounts separated by + or /.
export function parseDiscountChain(expr: string): number[] {
  const parts = expr.split(/[+\/]/).map((s) => s.trim());
  return parts.map((p) => {
    const n = parseFloat(p.replace("%", ""));
    if (isNaN(n)) throw new Error(`Invalid discount token: "${p}"`);
    return n / 100;
  });
}

// Compounds a discount chain against a list price.
// "64.7% + 2%" on 17835 → 17835 × (1−0.647) × (1−0.02)
export function applyDiscountChain(listPrice: number, discounts: number[]): number {
  return discounts.reduce((price, d) => price * (1 - d), listPrice);
}

// --- Price resolver ---
// ROUNDING NOTE: cost-side resolvedCost is rounded to 2 decimal places
// (matching the displayed value, e.g. 6,169.84) before being multiplied by qty.
// This is the tunable rounding sequence — confirm with Siva against a real quote.
// The sell-side rate is taken as-is (direct rates are already clean integers here).
export function resolvePrice(mode: PriceMode): number {
  if (mode.kind === "direct") {
    return mode.rate;
  }
  const discounts = parseDiscountChain(mode.discountExpr);
  const raw = applyDiscountChain(mode.listPrice, discounts);
  // Round to 2 decimal places — this matches the displayed cost/unit
  return Math.round(raw * 100) / 100;
}

// --- Per-line calculator ---
export function calcLine(input: LineInput): LineResult {
  const resolvedCost = resolvePrice(input.cost);
  const resolvedSell = resolvePrice(input.sell);

  const lineCostTotal = Math.round(resolvedCost * input.qty);
  const lineSaleTotal = Math.round(resolvedSell * input.qty);
  const lineProfit = lineSaleTotal - lineCostTotal;
  const gstAmount = Math.round(lineSaleTotal * (input.gstPct / 100));
  const lineCustomerTotal = lineSaleTotal + gstAmount;

  return {
    name: input.name,
    qty: input.qty,
    resolvedCost,
    resolvedSell,
    lineCostTotal,
    lineSaleTotal,
    lineProfit,
    gstAmount,
    lineCustomerTotal,
  };
}

// --- Quote totals ---
export function calcTotals(lines: LineResult[]): QuoteTotals {
  const totalCost = lines.reduce((s, l) => s + l.lineCostTotal, 0);
  const totalSale = lines.reduce((s, l) => s + l.lineSaleTotal, 0);
  const grossProfit = totalSale - totalCost;
  const profitOnCostPct = totalCost > 0 ? (grossProfit / totalCost) * 100 : 0;
  const profitOnSalesPct = totalSale > 0 ? (grossProfit / totalSale) * 100 : 0;
  const totalGst = lines.reduce((s, l) => s + l.gstAmount, 0);
  const grandTotal = totalSale + totalGst;

  return {
    totalCost,
    totalSale,
    grossProfit,
    profitOnCostPct,
    profitOnSalesPct,
    totalGst,
    grandTotal,
  };
}

// --- Convenience: run full quote ---
export function calcQuote(inputs: LineInput[]): { lines: LineResult[]; totals: QuoteTotals } {
  const lines = inputs.map(calcLine);
  const totals = calcTotals(lines);
  return { lines, totals };
}
