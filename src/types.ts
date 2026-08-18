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

/** The editable half of a customer — id and createdAt are never touched. */
export type CustomerEdits = Partial<Pick<Customer, "name" | "phone" | "address">>;

/**
 * What actually changed between a stored customer and the edit sheet's draft,
 * or null when the answer is "nothing worth writing".
 *
 * Trims before comparing, so reopening the sheet and closing it writes nothing,
 * and trims what it returns, because these three fields print on the To block of
 * every quotation the customer receives — a trailing space is visible there.
 *
 * A blank name yields null rather than a partial patch: the name titles every
 * quote and the customer row, so a draft that clears it is invalid as a whole,
 * not an invitation to apply the rest of it. The sheet also disables Save in
 * that state; this is the guard behind the guard.
 *
 * Reads the stored side defensively — customers written before a field existed
 * have it `undefined`, and `undefined` must count as a change to "", not crash.
 */
export function customerPatch(
  stored: Customer,
  name: string,
  phone: string,
  address: string
): CustomerEdits | null {
  const draft = { name: name.trim(), phone: phone.trim(), address: address.trim() };
  if (!draft.name) return null;

  const patch: CustomerEdits = {};
  for (const key of ["name", "phone", "address"] as const) {
    if (draft[key] !== (stored[key] ?? "").trim()) patch[key] = draft[key];
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Where a duplicate is going, and when it was made. */
export interface DuplicateOpts {
  customerId: string;
  customerName: string;
  /** Injected rather than read from the clock, so the result is testable. */
  now: number;
}

/** Everything `saveQuote` needs for the new quote. */
export interface DuplicateResult {
  customerId: string;
  customerName: string;
  name: string;
  lines: UILine[];
  status: QuoteStatus;
  createdAt: number;
}

/**
 * A quote copied to a new one, for the same customer or a different one.
 *
 * This does NOT breach the locked "no price memory" rule. That rule forbids the
 * *app inferring* prices — a catalog, an index, suggestions. This copies a
 * document Dad picked. The app learns nothing and stores no price history.
 *
 * The real hazard is stale prices carried forward silently, and it is answered
 * by making the copy obvious rather than by adding cleverness: the name says it
 * is a copy, and the status is forced back to draft so a copied *accepted*
 * quote can never read as a second accepted quote.
 *
 * Returns arguments rather than writing anything. The Firestore write stays on
 * `saveQuote`, which already races the server ack — a second write site would
 * be a second chance to hang Dad's button offline (see firestoreAck.ts).
 *
 * `totalSale` is deliberately absent: it is denormalized, the stored value can
 * be stale on pre-PI-2 quotes with fractional quantities (bug #9), and copying
 * it forward would carry that staleness into a brand new document. The caller
 * recomputes it from `lines`.
 */
export function duplicateQuote(
  source: QuoteDoc,
  opts: DuplicateOpts
): DuplicateResult {
  const base = source.name?.trim() ?? "";
  // "Untitled" was an internal storage placeholder before PI-2 promoted the
  // quote name to a Subject line — see QuoteEditor. It is not a real name.
  const real = base === "Untitled" ? "" : base;

  return {
    customerId: opts.customerId,
    customerName: opts.customerName,
    name: real ? `${real} (copy)` : "Copy of Untitled",
    // Fresh ids from 1, and a fresh object per line so editing the copy cannot
    // reach back into the quote it came from.
    lines: (source.lines ?? []).map((l, i) => ({ ...l, id: i + 1 })),
    status: "draft",
    createdAt: opts.now,
  };
}
