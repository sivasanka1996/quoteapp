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

export interface QuoteDoc {
  id: string;
  customerId: string;
  customerName: string;
  name: string;       // quote label / description
  lines: UILine[];
  totalSale: number;  // denormalized for list display
  createdAt: number;
  updatedAt: number;
}
