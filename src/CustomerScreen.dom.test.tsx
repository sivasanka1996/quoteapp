import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerScreen } from "./CustomerScreen";
import type { Customer, QuoteDoc } from "./types";

const saveQuote = vi.fn().mockResolvedValue({ id: "q-new", queued: false });
const copyQuoteTo = vi.fn().mockResolvedValue({ id: "q-new", queued: false });

const existing: QuoteDoc = {
  id: "q1",
  customerId: "c1",
  customerName: "Ravi Electricals",
  name: "Shop order",
  lines: [{
    id: 4, name: "Wire 2.5sq", qty: "3",
    costMode: "direct", costList: "", costDisc1: "", costDisc2: "", costRate: "800",
    sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "950",
    gstPct: "18",
  }],
  // Deliberately stale, like a real pre-fix quote (bug #9): 3 × 950 = 2850,
  // not 1900. If confirmCopy ever regressed to passing this stored value
  // straight through instead of recomputing, the "recomputes the total"
  // test below would still see a plausible-looking number and must not be
  // able to mistake it for the right one.
  totalSale: 1900,
  status: "accepted",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

vi.mock("./useQuotes", () => ({
  useQuotes: () => ({
    quotes: [existing], loading: false,
    saveQuote, copyQuoteTo, setStatus: vi.fn(), deleteQuote: vi.fn(),
  }),
  useAllQuotes: () => ({ quotes: [existing], loading: false }),
}));
vi.mock("./useCustomers", () => ({ updateCustomerDoc: vi.fn() }));
vi.mock("./firebase", () => ({ db: {} }));

const customer: Customer = {
  id: "c1", name: "Ravi Electricals", phone: "9999999999",
  address: "Miyapur", createdAt: 1_700_000_000_000,
};

const other: Customer = {
  id: "c2", name: "Kumar Traders", phone: "8888888888",
  address: "Kukatpally", createdAt: 1_700_000_000_000,
};

const allCustomers = [customer, other];

beforeEach(() => {
  saveQuote.mockClear();
  copyQuoteTo.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

// CustomerScreen's real Props are { customer, onBack, onNewQuote,
// onNewQuoteFromItems, onOpenQuote, onCustomerChange } — the brief's draft
// omitted onNewQuoteFromItems (a required prop, consumed by both the image
// and voice panels below), confirmed by reading the component's interface.
function screenUnderTest(onOpenQuote = vi.fn(), onCustomerChange = vi.fn()) {
  return (
    <CustomerScreen
      customer={customer}
      customers={allCustomers}
      onBack={vi.fn()}
      onNewQuote={vi.fn()}
      onNewQuoteFromItems={vi.fn()}
      onOpenQuote={onOpenQuote}
      onCustomerChange={onCustomerChange}
    />
  );
}

describe("CustomerScreen — copying a quote", () => {
  it("prefills the sheet with a name marked as a copy", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    expect(screen.getByDisplayValue("Shop order (copy)")).toBeInTheDocument();
  });

  it("says how many items travel with the copy", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    expect(screen.getByText(/1 item will be copied as a new draft/)).toBeInTheDocument();
  });

  it("writes through copyQuoteTo, which cannot overwrite the source", async () => {
    const onOpenQuote = vi.fn();
    render(screenUnderTest(onOpenQuote));
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    // copyQuoteTo(target, name, lines, totalSale, createdAt) — note it has no
    // existingId parameter at all, so the source quote is structurally
    // unreachable from this path rather than merely un-passed.
    await waitFor(() => expect(copyQuoteTo).toHaveBeenCalledTimes(1));
    const call = copyQuoteTo.mock.calls[0];
    expect(call[0]).toEqual({ id: "c1", name: "Ravi Electricals" });
    expect(call[1]).toBe("Shop order (copy)");
    expect(saveQuote).not.toHaveBeenCalled();

    // The copy reaches the editor as a draft even though the source was accepted.
    expect(onOpenQuote.mock.calls[0][0].status).toBe("draft");
  });

  it("offers every customer, defaulting to the one on screen", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));

    const picker = screen.getByRole("combobox", { name: /Copy to/ });
    expect(picker).toHaveValue("c1");
    expect(screen.getByRole("option", { name: /Ravi Electricals \(this customer\)/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kumar Traders" })).toBeInTheDocument();
  });

  it("copies to a different customer when one is picked", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Copy to/ }), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(copyQuoteTo).toHaveBeenCalledTimes(1));
    // The target, not the customer on screen. This is the whole feature: a
    // basket quoted to one customer, reused for another.
    expect(copyQuoteTo.mock.calls[0][0]).toEqual({ id: "c2", name: "Kumar Traders" });
    // Lines still travel.
    expect(copyQuoteTo.mock.calls[0][2]).toHaveLength(1);
  });

  it("follows a cross-customer copy to that customer, not into the editor", async () => {
    // Opening the copy in the editor would leave the header naming Ravi while
    // the quote belongs to Kumar.
    const onOpenQuote = vi.fn();
    const onCustomerChange = vi.fn();
    render(screenUnderTest(onOpenQuote, onCustomerChange));
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Copy to/ }), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(onCustomerChange).toHaveBeenCalledWith(other));
    expect(onOpenQuote).not.toHaveBeenCalled();
  });

  it("resets the picker to this customer each time the sheet opens", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Copy to/ }), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    expect(screen.getByRole("combobox", { name: /Copy to/ })).toHaveValue("c1");
  });

  it("recomputes the total instead of copying the stored one", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(copyQuoteTo).toHaveBeenCalledTimes(1));
    // 3 × 950 = 2850, computed by the real engine from the copied lines —
    // NOT the stored totalSale (1900), which is deliberately stale here so
    // this test cannot be fooled by a coincidental match (bug #9).
    expect(copyQuoteTo.mock.calls[0][3]).toBe(2850);
  });

  it("re-mints the line ids so the copy cannot collide with the source", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(copyQuoteTo).toHaveBeenCalledTimes(1));
    expect(copyQuoteTo.mock.calls[0][2][0].id).toBe(1);
    expect(existing.lines[0].id).toBe(4);   // source untouched
  });

  it("respects a name the user typed over the default", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    const field = screen.getByDisplayValue("Shop order (copy)");
    await userEvent.clear(field);
    await userEvent.type(field, "Kumar site");
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(copyQuoteTo).toHaveBeenCalledTimes(1));
    expect(copyQuoteTo.mock.calls[0][1]).toBe("Kumar site");
  });

  it("refuses to copy with a blank name", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.clear(screen.getByDisplayValue("Shop order (copy)"));
    expect(screen.getByRole("button", { name: "Copy Quote" })).toBeDisabled();
  });

  it("writes nothing when cancelled", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(copyQuoteTo).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Shop order (copy)")).not.toBeInTheDocument();
  });

  it("opens the new quote so Dad lands where he can change prices", async () => {
    const onOpenQuote = vi.fn();
    render(screenUnderTest(onOpenQuote));
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(onOpenQuote).toHaveBeenCalledTimes(1));
    expect(onOpenQuote.mock.calls[0][0].id).toBe("q-new");
    expect(onOpenQuote.mock.calls[0][0].status).toBe("draft");
  });
});
