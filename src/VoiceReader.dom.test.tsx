import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceReaderPanel } from "./VoiceReader";
import { VOICE_LANG_KEY } from "./voiceParse";

// The Web Speech API does not exist in jsdom. Everything else — the panel,
// parseIntent, matchLines and the confirm path — is real.
//
// Shape note: VoiceReader.tsx's onresult handler reads
// `e.results[i][0].transcript`, `e.results[i].isFinal` and iterates
// `e.results[i][j].transcript` for the alternatives, so `results[i]` has to be
// an array carrying an extra `isFinal` property — not a plain object with an
// `alternatives` field. Confirmed by reading the handler, not guessed.
class MockRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = vi.fn(() => {
    this.onstart?.();
    this.onaudiostart?.();
  });
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();

  /** Simulates a final recognition result — the onresult event only. */
  say(alternatives: string[]) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign(
          alternatives.map((transcript) => ({ transcript, confidence: 0.9 })),
          { isFinal: true, length: alternatives.length }
        ),
      ],
    });
  }
}

let mic: MockRecognition;

beforeEach(() => {
  mic = new MockRecognition();
  // `new SR()` in VoiceReader.tsx requires a real constructor — an arrow
  // function has no [[Construct]] and throws "is not a constructor". A
  // `function` expression is constructible; returning an object from it
  // overrides the `this` binding, so `new Ctor()` yields `mic` itself.
  const Ctor = vi.fn(function () {
    return mic;
  });
  // @ts-expect-error — jsdom has no SpeechRecognition to type against.
  globalThis.SpeechRecognition = Ctor;
  // @ts-expect-error — same.
  globalThis.webkitSpeechRecognition = Ctor;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function panel(over: Partial<Parameters<typeof VoiceReaderPanel>[0]> = {}) {
  return (
    <VoiceReaderPanel
      onAdd={vi.fn()}
      onSet={vi.fn()}
      lines={[]}
      onClose={vi.fn()}
      {...over}
    />
  );
}

/** Taps the idle screen's mic button. Our mock's start() fires onaudiostart
 *  synchronously, so the panel is in "listening" by the time this resolves. */
async function tapAndSpeak() {
  await userEvent.click(screen.getByRole("button", { name: /tap and speak/i }));
}

/** A result event followed by the session ending — "ended with words
 *  banked" in VoiceReader.tsx's own wording. `finish()` only runs from
 *  `onend`, so a test that only calls `mic.say()` never reaches the confirm
 *  screen; both calls are required. */
function finishSpeaking(alternatives: string[]) {
  act(() => {
    mic.say(alternatives);
    mic.onend?.();
  });
}

describe("VoiceReaderPanel — language", () => {
  it("starts in English and switches to Telugu", async () => {
    render(panel());
    const te = screen.getByRole("button", { name: "తెలుగు" });
    await userEvent.click(te);
    expect(te).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(VOICE_LANG_KEY)).toBe("te-IN");
  });

  it("remembers the choice across a remount", async () => {
    localStorage.setItem(VOICE_LANG_KEY, "te-IN");
    render(panel());
    expect(screen.getByRole("button", { name: "తెలుగు" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("VoiceReaderPanel — adding", () => {
  it("parses a spoken line into name, qty and rate, and hands it to onAdd", async () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(panel({ onAdd, onClose }));
    await tapAndSpeak();
    finishSpeaking(["6 wire 1.5sq rate 1650"]);

    await waitFor(() => expect(screen.getByDisplayValue("wire 1.5sq")).toBeInTheDocument());
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1650")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "wire 1.5sq", qty: 6, rate: 1650 });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the other alternatives and re-parses the one picked", async () => {
    render(panel());
    await tapAndSpeak();
    finishSpeaking(["6 wire rate 1650", "16 wire rate 1650"]);

    await screen.findByDisplayValue("wire");
    await userEvent.click(screen.getByRole("button", { name: /16 wire rate 1650/ }));
    await waitFor(() => expect(screen.getByDisplayValue("16")).toBeInTheDocument());
  });

  it("holds a decimal in qty and rate while typing, and passes it through on Add", async () => {
    // The PI-2 regression: a number input re-parsed on every keystroke turned
    // 2.5 into 25, because React restored "2" before the "5" was typed.
    const onAdd = vi.fn();
    render(panel({ onAdd }));
    await tapAndSpeak();
    finishSpeaking(["wire rate 100"]);

    const qty = await screen.findByDisplayValue("1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2.5");
    expect(qty).toHaveValue("2.5");

    const rate = screen.getByDisplayValue("100");
    await userEvent.clear(rate);
    await userEvent.type(rate, "12.5");
    expect(rate).toHaveValue("12.5");

    await userEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "wire", qty: 2.5, rate: 12.5 });
  });

  it("disables Add to quote once the name is cleared, and re-enables when typed back", async () => {
    render(panel());
    await tapAndSpeak();
    finishSpeaking(["wire rate 100"]);

    const name = await screen.findByDisplayValue("wire");
    expect(screen.getByRole("button", { name: "Add to quote" })).toBeEnabled();

    await userEvent.clear(name);
    expect(screen.getByRole("button", { name: "Add to quote" })).toBeDisabled();

    await userEvent.type(name, "wire");
    expect(screen.getByRole("button", { name: "Add to quote" })).toBeEnabled();
  });
});

describe("VoiceReaderPanel — changing an existing line", () => {
  const lines = [
    { id: 1, name: "Copper Wire 2.5sq" },
    { id: 2, name: "MCB 32A" },
  ];

  it("offers to change the matched line, and reports it through onSet", async () => {
    const onSet = vi.fn();
    render(panel({ lines, onSet }));
    await tapAndSpeak();
    finishSpeaking(["change MCB rate to 500"]);

    await waitFor(() => expect(screen.getByText("Change this item?")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /MCB 32A/ }));

    expect(onSet).toHaveBeenCalledWith(2, "rate", 500);
  });

  it("asks which line when two lines match equally, rather than guessing", async () => {
    render(panel({ lines: [{ id: 1, name: "Wire" }, { id: 2, name: "Wire" }] }));
    await tapAndSpeak();
    finishSpeaking(["change wire rate to 500"]);

    await waitFor(() =>
      expect(screen.getByText("Which item did you mean?")).toBeInTheDocument()
    );
    expect(screen.getAllByRole("button", { name: /Wire/ })).toHaveLength(2);
  });

  it("treats an unmatched change as a new item, not an error", async () => {
    render(panel({ lines }));
    await tapAndSpeak();
    finishSpeaking(["change transformer rate to 500"]);

    // Falls through to the ordinary add/confirm screen — a positive check,
    // not just the absence of the disambiguation prompt, so a version that
    // got stuck instead of falling through would also fail this.
    await waitFor(() => expect(screen.getByText(/I heard:/)).toBeInTheDocument());
    expect(screen.queryByText(/Which item/)).not.toBeInTheDocument();
  });
});

describe("VoiceReaderPanel — failures", () => {
  it("names the reason when the microphone is refused", async () => {
    render(panel());
    await tapAndSpeak();
    act(() => mic.onerror?.({ error: "not-allowed" }));

    await waitFor(() =>
      expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument()
    );
  });

  it("ignores a stale recognition-end after an error, instead of reopening the mic", async () => {
    // The stageRef guard (VoiceReader.tsx, `onend`): once stage has moved on
    // to "error", a late `onend` from the same session must be a no-op — not
    // a restart that silently reopens the mic and erases the error Dad is
    // looking at. (The guard's other job — recognising the LIVE stage rather
    // than a stale closured one — is what the "adding" tests above actually
    // exercise: with a stale-closure bug those never reach the confirm
    // screen at all, since onend would always bail out.)
    render(panel());
    await tapAndSpeak();
    act(() => mic.onerror?.({ error: "not-allowed" }));
    await waitFor(() =>
      expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument()
    );

    const startCallsBefore = mic.start.mock.calls.length;
    act(() => mic.onend?.());

    expect(mic.start.mock.calls.length).toBe(startCallsBefore);
    expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument();
    expect(screen.queryByText(/Listening/i)).not.toBeInTheDocument();
  });
});
