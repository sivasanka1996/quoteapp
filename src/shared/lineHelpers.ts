import { type LineInput } from "../calc/engine";
import { toPriceMode } from "./priceMode";
import { type UILine, type ItemDoc } from "../types";
import { type ReadItem } from "../readImage";
import { exactMatch } from "./matchCatalog";

// Pure line-item helpers — shared by QuoteEditor and InvoiceEditor via
// LineItemsEditor.tsx. Split into its own file (not exported alongside the
// components) because of react-refresh/only-export-components — same
// reason priceMode.ts exists. See docs/quotations.md / docs/billing.md.

let nextId = 1;
export function blankLine(): UILine {
  return {
    id: nextId++, name: "", qty: "",
    costMode: "discount", costList: "", costDisc1: "", costDisc2: "", costRate: "",
    sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "",
    gstPct: "18",
  };
}

export function toLineInput(l: UILine): LineInput {
  return {
    name: l.name, qty: parseInt(l.qty) || 0,
    cost: toPriceMode(l.costMode, l.costList, l.costDisc1, l.costDisc2, l.costRate),
    sell: toPriceMode(l.sellMode, l.sellList, l.sellDisc1, l.sellDisc2, l.sellRate),
    gstPct: parseFloat(l.gstPct) || 0,
  };
}

/** Copies a catalog item's cost fields onto a line — shape matches 1:1. */
export function costPatchFrom(item: ItemDoc): Partial<UILine> {
  return {
    costMode: item.costMode, costList: item.costList,
    costDisc1: item.costDisc1, costDisc2: item.costDisc2, costRate: item.costRate,
  };
}

/**
 * The catalog item for a scanned line: prefer Gemini's own `catalogId`
 * match (it saw the full catalog and can handle OCR noise / abbreviations),
 * falling back to a plain exact-name match if that's absent or stale.
 */
export function catalogMatchFor(catalogItems: ItemDoc[], it: ReadItem): ItemDoc | null {
  const byId = it.catalogId ? catalogItems.find((c) => c.id === it.catalogId) : undefined;
  return byId ?? exactMatch(catalogItems, it.name);
}

/** "64.7% + 2%" for display, or "" when there is no discount */
export function discountLabel(d1: string, d2: string): string {
  const v1 = parseFloat(d1), v2 = parseFloat(d2);
  if (!v1 && !v2) return "";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}% off`;
}

export type BlanketSide = "cost" | "sell" | "both";
export interface Blanket { side: BlanketSide; disc1: string; disc2: string; }

export function applyBlanket(_l: UILine, b: Blanket): Partial<UILine> {
  const p: Partial<UILine> = {};
  if (b.side === "cost" || b.side === "both") { p.costMode = "discount"; p.costDisc1 = b.disc1; p.costDisc2 = b.disc2; }
  if (b.side === "sell" || b.side === "both") { p.sellMode = "discount"; p.sellDisc1 = b.disc1; p.sellDisc2 = b.disc2; }
  return p;
}
