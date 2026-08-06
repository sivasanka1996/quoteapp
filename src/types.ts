// Shared types used across the app

export interface UILine {
  id: number;
  name: string;
  qty: string;
  costMode: "discount" | "direct";
  costList: string;
  costDisc1: string;
  costDisc2: string;
  costRate: string;
  sellMode: "discount" | "direct";
  sellList: string;
  sellDisc1: string;
  sellDisc2: string;
  sellRate: string;
  gstPct: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: number;
}

// Where a quote stands with the customer. Set by hand — nothing infers it.
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
];

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export interface QuoteDoc {
  id: string;
  customerId: string;
  customerName: string;
  name: string;       // quote label / description
  lines: UILine[];
  totalSale: number;  // denormalized for list display
  status?: QuoteStatus; // optional — quotes saved before this field existed
  createdAt: number;
  updatedAt: number;
}

// Quotes written before `status` existed read as undefined — treat them as draft
export function quoteStatus(q: QuoteDoc): QuoteStatus {
  return q.status ?? "draft";
}

/**
 * Next free line id, given the lines already on screen and the counter's
 * current value.
 *
 * Lines loaded from Firestore carry ids minted in an earlier session. Without
 * this the editor's counter still sits at 1, so Add Item on a saved quote
 * hands out an id that is already taken — React keys collide, edits patch two
 * rows at once, and delete removes the wrong item.
 *
 * Monotonic and idempotent: calling it twice with the same lines is safe
 * (StrictMode runs state initialisers twice in dev).
 */
export function seedNextId(lines: Pick<UILine, "id">[], current: number): number {
  return lines.reduce(
    (n, l) => (Number.isFinite(l.id) ? Math.max(n, l.id + 1) : n),
    current
  );
}

/**
 * True when a line has no cost side filled in, so the engine resolves its cost
 * to ₹0 and reports the whole sale value as profit.
 *
 * Voice and image imports set only `sellRate`, which is exactly this case —
 * without a warning the profit panel confidently overstates the margin.
 */
export function hasNoCost(l: UILine): boolean {
  if (l.costMode === "direct") return !(parseFloat(l.costRate) > 0);
  return !(parseFloat(l.costList) > 0);
}

/**
 * A quantity string as a number.
 *
 * Wire and cable sell by the metre, so "2.5" has to stay 2.5. This used to be
 * `parseInt(l.qty) || 0` in five separate places, which silently billed 2.5 m
 * as 2 m. Fractional quantities were never a problem for the engine — it takes
 * `qty: number` and always has.
 */
export function parseQty(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
