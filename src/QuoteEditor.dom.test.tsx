import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuoteEditor } from "./QuoteEditor";
import type { ReadItem } from "./readImage";
import type { Customer } from "./types";

// Firestore never runs here. The editor, the calc engine, the undo path and
// every warning are real. `useCompanySettings` is deliberately NOT mocked —
// it only touches localStorage, which jsdom provides, and none of these
// tests switch to the customer view where its output would even render.
const saveQuote = vi.fn().mockResolvedValue({ id: "q-new", queued: false });
vi.mock("./useQuotes", () => ({
  useQuotes: () => ({ quotes: [], loading: false, saveQuote, setStatus: vi.fn(), deleteQuote: vi.fn() }),
  useAllQuotes: () => ({ quotes: [], loading: false }),
}));

// Only the network is faked, same as ImageReader.dom.test.tsx — the undo test
// below drives the real ImageReaderPanel to get a real import onto the screen.
vi.mock("./readImage", async (orig) => {
  const actual = await orig<typeof import("./readImage")>();
  return { ...actual, readImageItems: vi.fn() };
});
const { readImageItems } = await import("./readImage");
const mockRead = vi.mocked(readImageItems);

function reply(items: ReadItem[]) {
  return { items, confidence: "full" as const, notes: "" };
}

const customer: Customer = {
  id: "c1", name: "Ravi Electricals", phone: "9999999999",
  address: "Miyapur", createdAt: 1_700_000_000_000,
};

beforeEach(() => {
  saveQuote.mockClear();
  mockRead.mockReset();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

// QuoteEditor's real Props are { customer, existingQuote, initialItems?, onBack }
// — existingQuote is required, not optional, confirmed by reading the
// component. A brand-new quote passes null.
function editor() {
  return <QuoteEditor customer={customer} existingQuote={null} onBack={vi.fn()} />;
}

describe("QuoteEditor — the no-cost warning", () => {
  it("warns when an item is sold with no cost entered", async () => {
    // Voice and image imports set only sellRate, which is exactly this case —
    // without the warning the profit panel confidently overstates the margin.
    // A qty is required too: the warning is gated on lineSaleTotal > 0 (a
    // priced-but-uncosted line that totals ₹0 has nothing to warn about), so
    // the brief's draft — rate only, no qty — would never trigger it.
    const { container } = render(editor());
    await userEvent.click(screen.getByRole("button", { name: /add item/i }));

    await userEvent.type(screen.getByLabelText(/^qty$/i), "1");
    const rate = screen.getAllByPlaceholderText(/rate/i)[0];
    await userEvent.type(rate, "1650");

    // "no cost" also appears verbatim as the row chip (.qe-chip-warn) once the
    // sheet is closed, and "no cost entered" appears a second time inside the
    // cost PriceSide's own inline warning (.qe-side-cost) — so this scopes to
    // the profit panel specifically rather than loosening the pattern.
    await waitFor(() => {
      const profit = container.querySelector(".qe-profit") as HTMLElement;
      expect(within(profit).getByText(/no cost entered/i)).toBeInTheDocument();
    });
  });
});

describe("QuoteEditor — undo an import", () => {
  it("has no undo bar before anything is imported", () => {
    render(editor());
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers undo after an image import, and restores the previous lines", async () => {
    // The brief suggested driving the voice panel; the image path exercises
    // the identical snapshot/undo logic (handleAddFromImage, sharing
    // lastImport with handleAddFromVoice) and needs no SpeechRecognition mock.
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 6, rate: 1650 }]));

    render(editor());
    await userEvent.click(screen.getByRole("button", { name: /read from image/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      input,
      new File([new Uint8Array([1, 2, 3])], "p1.jpg", { type: "image/jpeg" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));
    await screen.findByDisplayValue("Wire");
    await userEvent.click(screen.getByRole("button", { name: /Add 1 item/ }));

    // Back on the editor: the import landed and the undo bar named it.
    await waitFor(() =>
      expect(screen.getByText(/Added 1 item from image/)).toBeInTheDocument()
    );
    expect(screen.getByText("Wire")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Wire")).not.toBeInTheDocument();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });
});

describe("QuoteEditor — the engine reaches the screen", () => {
  it("compounds two discounts rather than adding them", async () => {
    // 17835 × (1−0.647) × (1−0.02) = 6169.84 — the fixture from CLAUDE.md.
    // Cost defaults to "discount" mode on a blank line, so its List price /
    // Discount % / Extra disc % fields are the ones on screen without having
    // to switch modes first.
    const { container } = render(editor());
    await userEvent.click(screen.getByRole("button", { name: /add item/i }));

    await userEvent.type(screen.getByLabelText(/^qty$/i), "1");
    await userEvent.type(screen.getByLabelText("List price"), "17835");
    await userEvent.type(screen.getByLabelText("Discount %"), "64.7");
    await userEvent.type(screen.getByLabelText("Extra disc %"), "2");

    await waitFor(() => {
      const costSide = container.querySelector(".qe-side-cost") as HTMLElement;
      // Additive would give list × (1 − 0.667) = 5938.85 instead — a different
      // rupee figure, so this test fails if compounding regresses to adding.
      expect(within(costSide).getByText(/6,169\.84/)).toBeInTheDocument();
    });
  });
});
