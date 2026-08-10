import { log } from "../log/logger";

// --- Failure policy: log, then RE-THROW ---
//
// Read spec §2.4 before changing anything here. Every other layer of this app
// catches and degrades; this one must not. A swallowed calc error becomes a
// silently wrong number on a customer's quotation — the one failure mode
// CLAUDE.md calls unacceptable. Re-throwing routes it to the ErrorBoundary, so
// Dad gets a recovery card instead of a plausible-looking wrong total.
//
// NEVER replace one of these `throw`s with a fallback return.

const LOGGED = Symbol("quoteapp.calcLogged");

/**
 * Log a calc failure once, then re-throw it unchanged.
 *
 * The marker keeps the innermost frame — the one with the specific bad input —
 * as the single log record. `calcQuote → calcLine → resolvePrice` would
 * otherwise write the same failure three times and bury the useful context.
 */
function failCalc(msg: string, e: unknown, context: unknown): never {
  try {
    const already =
      typeof e === "object" && e !== null && LOGGED in (e as object);
    if (!already) {
      if (typeof e === "object" && e !== null) {
        (e as Record<symbol, unknown>)[LOGGED] = true;
      }
      log.error("calc", msg, e, context);
    }
  } catch {
    /* a frozen error object is not a reason to lose the throw below */
  }
  throw e;
}

// --- Types ---

/**
 * How a price is arrived at.
 *
 * The discount chain is `number[]` — fractions, so 64.7% is 0.647 — and that
 * is what the app passes. `discountExpr` is the *other* entry point: a string
 * a human typed, which still has to be parsed. Before PI-6 there was only the
 * string, so the editor formatted its two numeric fields into "64.7% + 2%"
 * purely to have the engine split it apart again — money round-tripping
 * through text on every keystroke, with a locale-dependent `parseFloat` in the
 * middle.
 *
 * Give `discounts` when you have numbers. Give `discountExpr` only when you
 * genuinely have a string. Given both, `discounts` wins.
 */
export type PriceMode =
  | {
      kind: "discount";
      listPrice: number;
      discounts?: number[];
      discountExpr?: string;
    }
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
  try {
    const parts = expr.split(/[+/]/).map((s) => s.trim());
    return parts.map((p) => {
      const n = parseFloat(p.replace("%", ""));
      if (isNaN(n)) throw new Error(`Invalid discount token: "${p}"`);
      return n / 100;
    });
  } catch (e) {
    return failCalc("discount chain could not be parsed", e, { expr });
  }
}

// Compounds a discount chain against a list price.
// "64.7% + 2%" on 17835 → 17835 × (1−0.647) × (1−0.02)
export function applyDiscountChain(listPrice: number, discounts: number[]): number {
  return discounts.reduce((price, d) => price * (1 - d), listPrice);
}

/**
 * Percentages as the engine wants them: 64.7 → 0.647.
 *
 * Blank and unparseable entries drop out rather than becoming a 0% slab, which
 * multiplies by 1 and is therefore harmless but noisy. The `/100` lives here so
 * no screen has to know the engine's units.
 */
export function discountsFromPercents(
  ...percents: (string | number | null | undefined)[]
): number[] {
  const out: number[] = [];
  for (const p of percents) {
    const n = typeof p === "number" ? p : parseFloat(String(p ?? ""));
    if (Number.isFinite(n) && n !== 0) out.push(n / 100);
  }
  return out;
}

/** The chain as a label — "64.7% + 2%". Display only; never re-parsed. */
export function formatDiscountChain(discounts: number[]): string {
  if (discounts.length === 0) return "0%";
  return discounts.map((d) => `${round2(d * 100)}%`).join(" + ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The chain a PriceMode carries, preferring numbers over text.
 *
 * This is the one place the string path is still allowed to exist, and it is
 * reached only when a caller genuinely has a typed expression.
 */
function chainOf(mode: { discounts?: number[]; discountExpr?: string }): number[] {
  if (mode.discounts) return mode.discounts;
  if (mode.discountExpr !== undefined) return parseDiscountChain(mode.discountExpr);
  return [];
}

// --- Price resolver ---
// ROUNDING NOTE: cost-side resolvedCost is rounded to 2 decimal places
// (matching the displayed value, e.g. 6,169.84) before being multiplied by qty.
// This is the tunable rounding sequence — confirm with Siva against a real quote.
// The sell-side rate is taken as-is (direct rates are already clean integers here).
export function resolvePrice(mode: PriceMode): number {
  try {
    if (mode.kind === "direct") {
      return mode.rate;
    }
    const raw = applyDiscountChain(mode.listPrice, chainOf(mode));
    // Round to 2 decimal places — this matches the displayed cost/unit
    return Math.round(raw * 100) / 100;
  } catch (e) {
    return failCalc("price could not be resolved", e, { mode });
  }
}

// --- Per-line calculator ---
export function calcLine(input: LineInput): LineResult {
  try {
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
  } catch (e) {
    return failCalc("line could not be calculated", e, {
      name: input.name,
      qty: input.qty,
    });
  }
}

// --- Quote totals ---
export function calcTotals(lines: LineResult[]): QuoteTotals {
  try {
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
  } catch (e) {
    return failCalc("totals could not be calculated", e, {
      lineCount: lines?.length,
    });
  }
}

// --- Convenience: run full quote ---
export function calcQuote(inputs: LineInput[]): { lines: LineResult[]; totals: QuoteTotals } {
  try {
    const lines = inputs.map(calcLine);
    const totals = calcTotals(lines);
    log.debug("calc", "quote calculated", {
      lineCount: lines.length,
      totalSale: totals.totalSale,
    });
    return { lines, totals };
  } catch (e) {
    return failCalc("quote could not be calculated", e, {
      lineCount: inputs?.length,
    });
  }
}
