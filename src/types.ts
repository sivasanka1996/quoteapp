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

// Which app area an idea belongs to — matches the module areas in ROADMAP.md
export type IdeaService = "dashboard" | "pricing" | "quotations" | "billing" | "general";

export const IDEA_SERVICES: IdeaService[] = [
  "dashboard",
  "pricing",
  "quotations",
  "billing",
  "general",
];

export const IDEA_SERVICE_LABEL: Record<IdeaService, string> = {
  dashboard: "Dashboard",
  pricing: "Pricing",
  quotations: "Quotations",
  billing: "Billing",
  general: "General",
};

export interface IdeaDoc {
  id: string;
  text: string;
  status: IdeaStatus;
  service?: IdeaService; // optional — ideas saved before this field existed read as undefined
  createdAt: number;
  updatedAt: number;
}

// Ideas written before `service` existed read as undefined — treat them as general
export function ideaService(idea: IdeaDoc): IdeaService {
  return idea.service ?? "general";
}

// A catalog entry in the Pricing module — see docs/pricing.md
// Cost only: this is Dad's vendor price reference. Sell price to the
// customer is decided per-quote via the existing discount tool in
// QuoteEditor, not stored here.
export interface ItemDoc {
  id: string;
  name: string;
  brand: string; // free text — e.g. "Finolex"; "" when the item has no brand split
  unit: string; // e.g. "per piece", "per meter" — optional, may be ""
  costMode: "discount" | "direct";
  costList: string;
  costDisc1: string;
  costDisc2: string;
  costRate: string;
  updatedAt: number;
  source: "manual" | "image";
}
