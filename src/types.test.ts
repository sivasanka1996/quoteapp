import { describe, it, expect } from "vitest";
import {
  quoteStatus,
  seedNextId,
  hasNoCost,
  parseQty,
  customerPatch,
  duplicateQuote,
  type Customer,
  type QuoteDoc,
  type UILine,
} from "./types";

function quote(partial: Partial<QuoteDoc>): QuoteDoc {
  return {
    id: "q1",
    customerId: "c1",
    customerName: "Anjene Guntur",
    name: "Test quote",
    lines: [],
    totalSale: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("quoteStatus", () => {
  it("returns the stored status", () => {
    expect(quoteStatus(quote({ status: "accepted" }))).toBe("accepted");
    expect(quoteStatus(quote({ status: "declined" }))).toBe("declined");
  });

  it("treats quotes saved before the field existed as drafts", () => {
    expect(quoteStatus(quote({}))).toBe("draft");
    expect(quoteStatus(quote({ status: undefined }))).toBe("draft");
  });
});

function line(partial: Partial<UILine>): UILine {
  return {
    id: 1,
    name: "",
    qty: "",
    costMode: "discount",
    costList: "",
    costDisc1: "",
    costDisc2: "",
    costRate: "",
    sellMode: "direct",
    sellList: "",
    sellDisc1: "",
    sellDisc2: "",
    sellRate: "",
    gstPct: "18",
    ...partial,
  };
}

describe("seedNextId", () => {
  it("leaves the counter alone for a quote with no lines", () => {
    expect(seedNextId([], 1)).toBe(1);
    expect(seedNextId([], 7)).toBe(7);
  });

  it("clears the ids of a quote saved in an earlier session", () => {
    // The bug: counter sits at 1, saved lines already own 1, 2 and 3.
    expect(seedNextId([{ id: 1 }, { id: 2 }, { id: 3 }], 1)).toBe(4);
  });

  it("takes the highest id, not the last one", () => {
    expect(seedNextId([{ id: 9 }, { id: 2 }], 1)).toBe(10);
  });

  it("never moves the counter backwards", () => {
    expect(seedNextId([{ id: 2 }], 50)).toBe(50);
  });

  it("is idempotent — StrictMode runs state initialisers twice", () => {
    const once = seedNextId([{ id: 3 }], 1);
    expect(seedNextId([{ id: 3 }], once)).toBe(once);
  });

  it("ignores lines with a missing or corrupt id", () => {
    const bad = [{ id: undefined }, { id: NaN }] as unknown as Pick<UILine, "id">[];
    expect(seedNextId(bad, 4)).toBe(4);
  });
});

describe("hasNoCost", () => {
  it("flags an imported line — sell rate set, cost untouched", () => {
    expect(hasNoCost(line({ sellRate: "450", costMode: "discount" }))).toBe(true);
  });

  it("flags a direct-cost line with an empty rate", () => {
    expect(hasNoCost(line({ costMode: "direct", costRate: "" }))).toBe(true);
    expect(hasNoCost(line({ costMode: "direct", costRate: "0" }))).toBe(true);
  });

  it("accepts a direct cost rate", () => {
    expect(hasNoCost(line({ costMode: "direct", costRate: "310.50" }))).toBe(false);
  });

  it("accepts a discount-mode line with a list price", () => {
    expect(hasNoCost(line({ costMode: "discount", costList: "17835" }))).toBe(false);
  });

  it("flags discount mode with a zero list price, discounts or not", () => {
    expect(hasNoCost(line({ costMode: "discount", costList: "0", costDisc1: "64.7" }))).toBe(true);
  });
});

describe("parseQty", () => {
  it("keeps a fractional quantity — wire sells by the metre", () => {
    expect(parseQty("2.5")).toBe(2.5);
    expect(parseQty("0.75")).toBe(0.75);
  });

  it("reads whole numbers unchanged", () => {
    expect(parseQty("402")).toBe(402);
  });

  it("is 0 for anything unreadable, as parseInt(s) || 0 was", () => {
    expect(parseQty("")).toBe(0);
    expect(parseQty("abc")).toBe(0);
  });
});

describe("customerPatch", () => {
  const dad: Customer = {
    id: "c1",
    name: "Sri Balaji Electricals",
    phone: "+91 98765 43210",
    address: "Kukatpally",
    createdAt: 0,
  };

  it("is null when nothing changed, so a no-op never writes", () => {
    expect(customerPatch(dad, dad.name, dad.phone, dad.address)).toBeNull();
  });

  it("is null when only surrounding whitespace changed", () => {
    expect(customerPatch(dad, "  Sri Balaji Electricals  ", dad.phone, dad.address)).toBeNull();
  });

  it("carries only the fields that actually changed", () => {
    expect(customerPatch(dad, dad.name, "+91 90000 11111", dad.address)).toEqual({
      phone: "+91 90000 11111",
    });
  });

  it("trims what it does carry — a stray space reaches the customer's PDF", () => {
    expect(customerPatch(dad, dad.name, dad.phone, "  Miyapur ")).toEqual({
      address: "Miyapur",
    });
  });

  it("carries several fields at once", () => {
    expect(customerPatch(dad, "Balaji Electricals", "9000011111", dad.address)).toEqual({
      name: "Balaji Electricals",
      phone: "9000011111",
    });
  });

  it("allows clearing an optional field", () => {
    expect(customerPatch(dad, dad.name, "", dad.address)).toEqual({ phone: "" });
  });

  it("refuses to blank the name — every quote is titled with it", () => {
    expect(customerPatch(dad, "   ", dad.phone, dad.address)).toBeNull();
  });

  it("tolerates a record saved before a field existed", () => {
    const legacy = { ...dad, phone: undefined as unknown as string };
    expect(customerPatch(legacy, dad.name, "9000011111", dad.address)).toEqual({
      phone: "9000011111",
    });
  });
});

describe("duplicateQuote", () => {
  function line(id: number, name: string): UILine {
    return {
      id, name, qty: "2",
      costMode: "discount", costList: "1000", costDisc1: "10", costDisc2: "", costRate: "",
      sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "950",
      gstPct: "18",
    };
  }

  function source(over: Partial<QuoteDoc> = {}): QuoteDoc {
    return {
      id: "q1",
      customerId: "c1",
      customerName: "Ravi Electricals",
      name: "Shop order",
      lines: [line(4, "Wire 2.5sq"), line(9, "MCB 32A")],
      totalSale: 3800,
      status: "accepted",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      ...over,
    };
  }

  const opts = { customerId: "c1", customerName: "Ravi Electricals", now: 1_800_000_000_000 };

  it("copies every line", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.lines).toHaveLength(2);
    expect(d.lines.map((l) => l.name)).toEqual(["Wire 2.5sq", "MCB 32A"]);
  });

  it("re-mints line ids from 1 so they cannot collide with the source", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.lines.map((l) => l.id)).toEqual([1, 2]);
  });

  it("deep-copies, so editing the copy never touches the original", () => {
    const src = source();
    const d = duplicateQuote(src, opts);
    d.lines[0].sellRate = "1";
    expect(src.lines[0].sellRate).toBe("950");
  });

  it("forces the copy to draft, whatever the source was", () => {
    expect(duplicateQuote(source({ status: "accepted" }), opts).status).toBe("draft");
    expect(duplicateQuote(source({ status: "sent" }), opts).status).toBe("draft");
  });

  it("marks the name as a copy", () => {
    expect(duplicateQuote(source({ name: "Shop order" }), opts).name).toBe("Shop order (copy)");
  });

  it("names an unnamed quote's copy without leaving a stray bracket", () => {
    expect(duplicateQuote(source({ name: "" }), opts).name).toBe("Copy of Untitled");
    expect(duplicateQuote(source({ name: "   " }), opts).name).toBe("Copy of Untitled");
  });

  it("treats the legacy 'Untitled' placeholder as no name", () => {
    // Pre-PI-2 quotes carry the literal word; it is not something Dad typed.
    expect(duplicateQuote(source({ name: "Untitled" }), opts).name).toBe("Copy of Untitled");
  });

  it("is a new document, not a revision", () => {
    const d = duplicateQuote(source(), opts);
    expect(d.createdAt).toBe(1_800_000_000_000);
  });

  it("can be aimed at a different customer", () => {
    const d = duplicateQuote(source(), {
      customerId: "c2", customerName: "Kumar Traders", now: 1_800_000_000_000,
    });
    expect(d.customerId).toBe("c2");
    expect(d.customerName).toBe("Kumar Traders");
  });

  it("survives a quote with no lines", () => {
    expect(duplicateQuote(source({ lines: [] }), opts).lines).toEqual([]);
  });
});
