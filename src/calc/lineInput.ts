// UILine (what the editor holds, all strings) → LineInput (what the engine
// takes, all numbers).
//
// Lifted out of QuoteEditor.tsx so a second caller can total a quote without
// importing from a component. CustomerScreen needs exactly that to recompute
// `totalSale` when duplicating.

import { discountsFromPercents, type LineInput, type PriceMode } from "./engine";
import { parseQty, type UILine } from "../types";

export function toPriceMode(
  mode: "discount" | "direct", list: string,
  disc1: string, disc2: string, rate: string
): PriceMode {
  if (mode === "direct") return { kind: "direct", rate: parseFloat(rate) || 0 };
  // Numbers straight through. This used to format the two fields into
  // "64.7% + 2%" so the engine could split them apart again — see the
  // PriceMode doc comment in calc/engine.ts.
  return {
    kind: "discount",
    listPrice: parseFloat(list) || 0,
    discounts: discountsFromPercents(disc1, disc2),
  };
}

export function toLineInput(l: UILine): LineInput {
  return {
    name: l.name, qty: parseQty(l.qty),
    cost: toPriceMode(l.costMode, l.costList, l.costDisc1, l.costDisc2, l.costRate),
    sell: toPriceMode(l.sellMode, l.sellList, l.sellDisc1, l.sellDisc2, l.sellRate),
    gstPct: parseFloat(l.gstPct) || 0,
  };
}
