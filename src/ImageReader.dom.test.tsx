import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageReaderPanel } from "./ImageReader";
import type { ReadItem } from "./readImage";

// Only the network is faked. The component, mergePages and the whole confirm
// path are the real ones — which is the point: a faked panel proves nothing.
vi.mock("./readImage", async (orig) => {
  const actual = await orig<typeof import("./readImage")>();
  return { ...actual, readImageItems: vi.fn() };
});

const { readImageItems } = await import("./readImage");
const mockRead = vi.mocked(readImageItems);

function file(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

function reply(items: ReadItem[]) {
  return { items, confidence: "full" as const, notes: "" };
}

beforeEach(() => {
  mockRead.mockReset();
  // jsdom implements neither of these and ImageReader uses both.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function pick(names: string[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, names.map(file));
}

describe("ImageReaderPanel — multi-page", () => {
  it("badges each picked page and offers to read them all", async () => {
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);

    expect(screen.getByAltText("Page 1")).toBeInTheDocument();
    expect(screen.getByAltText("Page 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read 3 pages" })).toBeInTheDocument();
  });

  it("reads pages one at a time, never in parallel", async () => {
    // Spec §5.2: a long list already sits against a single 8192-token ceiling,
    // so pages must never share one budget. Measured, not asserted by comment.
    let inFlight = 0;
    let maxInFlight = 0;
    mockRead.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return reply([{ name: "Wire", qty: 1, rate: 100 }]);
    });

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(3));
    expect(maxInFlight).toBe(1);
  });

  it("merges pages in order with their page badges", async () => {
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockResolvedValueOnce(reply([{ name: "MCB", qty: 4, rate: 450 }]));

    const { container } = render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 2 pages" }));

    await waitFor(() =>
      expect(screen.getByText(/Found 2 items across 2 pages/)).toBeInTheDocument()
    );
    // "p1"/"p2" also badge the page strip above, so scope to the confirm
    // list's own item rows rather than screen.getByText, which would find
    // both and fail on ambiguity. And bind each name to ITS OWN row's badge
    // — asserting "p1" and "p2" both merely *appear* would not catch a
    // swapped badge (Wire tagged p2, MCB tagged p1).
    const itemsList = container.querySelector(".ir-items") as HTMLElement;
    const itemRows = Array.from(itemsList.querySelectorAll(".ir-item"));
    expect(itemRows).toHaveLength(2);
    const wireRow = itemRows.find((r) => within(r as HTMLElement).queryByDisplayValue("Wire"));
    const mcbRow = itemRows.find((r) => within(r as HTMLElement).queryByDisplayValue("MCB"));
    expect(within(wireRow as HTMLElement).getByText("p1")).toBeInTheDocument();
    expect(within(mcbRow as HTMLElement).getByText("p2")).toBeInTheDocument();
  });

  it("keeps the good pages when one fails", async () => {
    // Losing a five-page order to one blurry photo is the failure Dad would
    // actually hit (spec §5.3).
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockRejectedValueOnce(new Error("unreadable"))
      .mockResolvedValueOnce(reply([{ name: "Socket", qty: 2, rate: 120 }]));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg", "p3.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retry page 2/ })).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue("Wire")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Socket")).toBeInTheDocument();
  });

  it("a retry re-reads only the failed page and keeps hand edits", async () => {
    mockRead
      .mockResolvedValueOnce(reply([{ name: "Wire", qty: 6, rate: 1650 }]))
      .mockRejectedValueOnce(new Error("unreadable"));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg", "p2.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read 2 pages" }));

    const nameField = await screen.findByDisplayValue("Wire");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "EDITED BY HAND");

    mockRead.mockReset();
    mockRead.mockResolvedValueOnce(reply([{ name: "MCB", qty: 4, rate: 450 }]));
    await userEvent.click(screen.getByRole("button", { name: /Retry page 2/ }));

    await waitFor(() => expect(screen.getByDisplayValue("MCB")).toBeInTheDocument());
    expect(mockRead).toHaveBeenCalledTimes(1);
    // Re-reading everything would have thrown this away.
    expect(screen.getByDisplayValue("EDITED BY HAND")).toBeInTheDocument();
  });
});

describe("ImageReaderPanel — the confirm list", () => {
  it("counts incomplete rows, and says it in the singular when there is one", async () => {
    mockRead.mockResolvedValue(
      reply([
        { name: "Wire", qty: 6, rate: 1650 },
        { name: "MCB", qty: 4, rate: null },
        { name: "Socket", qty: 0, rate: 120 },
      ])
    );

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    await waitFor(() =>
      expect(screen.getByText(/2 items still need/)).toBeInTheDocument()
    );

    // Filling the missing rate must flip the sentence to the singular branch.
    const rateFields = screen.getAllByPlaceholderText("—");
    await userEvent.type(rateFields[1], "450");
    await waitFor(() =>
      expect(screen.getByText(/1 item still needs/)).toBeInTheDocument()
    );
  });

  it("holds a decimal while it is being typed", async () => {
    // The PI-2 regression: a number input re-parsed on every keystroke turned
    // 2.5 into 25, because React restored "2" before the "5" arrived.
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));

    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    const qty = await screen.findByDisplayValue("1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2.5");
    expect(qty).toHaveValue("2.5");
  });

  it("hands only the checked rows to the quote", async () => {
    const onAdd = vi.fn();
    mockRead.mockResolvedValue(
      reply([
        { name: "Wire", qty: 6, rate: 1650 },
        { name: "MCB", qty: 4, rate: 450 },
      ])
    );

    render(<ImageReaderPanel onAdd={onAdd} onClose={vi.fn()} />);
    await pick(["p1.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Read items from image" }));

    await screen.findByDisplayValue("Wire");
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: /Add 1 item/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toHaveLength(1);
    expect(onAdd.mock.calls[0][0][0].name).toBe("MCB");
  });
});

describe("ImageReaderPanel — page order and long reads", () => {
  it("moves a page earlier, and the merged order follows", async () => {
    // Keyed by WHICH FILE is read, not by call order. A call-order mock
    // (mockResolvedValueOnce/mockResolvedValueOnce) would pass even with a
    // no-op reorderPage: reads always walk the pages array front-to-back, so
    // whatever sits at index 0 gets the first queued reply regardless of
    // whether a swap actually happened — see the fix report for the reasoning
    // and the red-then-green proof.
    mockRead.mockImplementation(async (input: File) => {
      if (input.name === "a.jpg") return reply([{ name: "FROM-A", qty: 1, rate: 10 }]);
      if (input.name === "b.jpg") return reply([{ name: "FROM-B", qty: 1, rate: 20 }]);
      throw new Error(`unexpected file ${input.name}`);
    });

    const { container } = render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["a.jpg", "b.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Move page 2 earlier" }));
    await userEvent.click(screen.getByRole("button", { name: "Read 2 pages" }));

    await waitFor(() => expect(screen.getByDisplayValue("FROM-B")).toBeInTheDocument());
    const names = Array.from(
      container.querySelectorAll<HTMLInputElement>(".ir-items .ir-item-name")
    ).map((i) => i.value);
    // b.jpg was moved to page 1, a.jpg to page 2 — the merged order must
    // follow the swap, not the pick order.
    expect(names).toEqual(["FROM-B", "FROM-A"]);
  });

  it("cannot move the first page earlier or the last page later", async () => {
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["a.jpg", "b.jpg"]);

    expect(screen.getByRole("button", { name: "Move page 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move page 2 later" })).toBeDisabled();
  });

  it("confirms before a long read, and does not call out until confirmed", async () => {
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Read 6 pages" }));
    expect(screen.getByText(/read one at a time/)).toBeInTheDocument();
    expect(mockRead).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^Read 6 pages$/ }));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(6));
  });

  it("reads three pages without asking", async () => {
    mockRead.mockResolvedValue(reply([{ name: "Wire", qty: 1, rate: 100 }]));
    render(<ImageReaderPanel onAdd={vi.fn()} onClose={vi.fn()} />);
    await pick(["1.jpg", "2.jpg", "3.jpg"]);

    await userEvent.click(screen.getByRole("button", { name: "Read 3 pages" }));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(3));
  });
});
