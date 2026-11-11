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

// Build-tracking status for an idea — see docs/ideas.md
export type IdeaStatus = "idea" | "finalized" | "building" | "built";

export const IDEA_STATUSES: IdeaStatus[] = [
  "idea",
  "finalized",
  "building",
  "built",
];

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  idea: "Idea",
  finalized: "Finalized",
  building: "Building",
  built: "Built",
};

export interface IdeaDoc {
  id: string;
  text: string;
  status: IdeaStatus;
  createdAt: number;
  updatedAt: number;
}
