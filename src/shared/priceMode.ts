import { type PriceMode } from "../calc/engine";

/** "64.7% + 2%" for a compound discount chain, or "0%" when there is none. */
export function buildDiscountExpr(d1: string, d2: string): string {
  const v1 = parseFloat(d1), v2 = parseFloat(d2);
  if (!v1 && !v2) return "0%";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}%`;
}

/** Turns a PriceSide's string fields into the calc engine's PriceMode. */
export function toPriceMode(
  mode: "discount" | "direct", list: string,
  disc1: string, disc2: string, rate: string
): PriceMode {
  if (mode === "direct") return { kind: "direct", rate: parseFloat(rate) || 0 };
  return { kind: "discount", listPrice: parseFloat(list) || 0, discountExpr: buildDiscountExpr(disc1, disc2) };
}
