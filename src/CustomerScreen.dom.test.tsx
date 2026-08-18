import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerScreen } from "./CustomerScreen";
import type { Customer, QuoteDoc } from "./types";

const saveQuote = vi.fn().mockResolvedValue({ id: "q-new", queued: false });

const existing: QuoteDoc = {
  id: "q1",
  customerId: "c1",
  customerName: "Ravi Electricals",
  name: "Shop order",
  lines: [{
    id: 4, name: "Wire 2.5sq", qty: "2",
    costMode: "direct", costList: "", costDisc1: "", costDisc2: "", costRate: "800",
    sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "950",
    gstPct: "18",
  }],
  totalSale: 1900,
  status: "accepted",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

vi.mock("./useQuotes", () => ({
  useQuotes: () => ({
    quotes: [existing], loading: false,
    saveQuote, setStatus: vi.fn(), deleteQuote: vi.fn(),
  }),
  useAllQuotes: () => ({ quotes: [existing], loading: false }),
}));
vi.mock("./useCustomers", () => ({ updateCustomerDoc: vi.fn() }));
vi.mock("./firebase", () => ({ db: {} }));

const customer: Customer = {
  id: "c1", name: "Ravi Electricals", phone: "9999999999",
  address: "Miyapur", createdAt: 1_700_000_000_000,
};

beforeEach(() => {
  saveQuote.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

// CustomerScreen's real Props are { customer, onBack, onNewQuote,
// onNewQuoteFromItems, onOpenQuote, onCustomerChange } — the brief's draft
// omitted onNewQuoteFromItems (a required prop, consumed by both the image
// and voice panels below), confirmed by reading the component's interface.
function screenUnderTest(onOpenQuote = vi.fn()) {
  return (
    <CustomerScreen
      customer={customer}
      onBack={vi.fn()}
      onNewQuote={vi.fn()}
      onNewQuoteFromItems={vi.fn()}
      onOpenQuote={onOpenQuote}
      onCustomerChange={vi.fn()}
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

  it("writes a draft, never a second accepted quote", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    // saveQuote(customerName, name, lines, totalSale, status, existingId, createdAt)
    const call = saveQuote.mock.calls[0];
    expect(call[1]).toBe("Shop order (copy)");
    expect(call[4]).toBe("draft");
    expect(call[5]).toBeUndefined();   // a new document, not an update
  });

  it("recomputes the total instead of copying the stored one", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    // 2 × 950 = 1900, computed by the real engine from the copied lines —
    // not read off the stored totalSale, which can be stale (bug #9).
    expect(saveQuote.mock.calls[0][3]).toBe(1900);
  });

  it("re-mints the line ids so the copy cannot collide with the source", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    expect(saveQuote.mock.calls[0][2][0].id).toBe(1);
    expect(existing.lines[0].id).toBe(4);   // source untouched
  });

  it("respects a name the user typed over the default", async () => {
    render(screenUnderTest());
    await userEvent.click(screen.getByRole("button", { name: /Copy quote Shop order/ }));
    const field = screen.getByDisplayValue("Shop order (copy)");
    await userEvent.clear(field);
    await userEvent.type(field, "Kumar site");
    await userEvent.click(screen.getByRole("button", { name: "Copy Quote" }));

    await waitFor(() => expect(saveQuote).toHaveBeenCalledTimes(1));
    expect(saveQuote.mock.calls[0][1]).toBe("Kumar site");
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

    expect(saveQuote).not.toHaveBeenCalled();
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
