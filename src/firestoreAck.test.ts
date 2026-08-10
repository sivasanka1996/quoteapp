import { describe, it, expect, vi, afterEach } from "vitest";
import { ackOrQueued, ACK_TIMEOUT_MS } from "./firestoreAck";

afterEach(() => {
  vi.useRealTimers();
});

describe("ackOrQueued", () => {
  it("reports not-queued when the server acks", async () => {
    expect(await ackOrQueued(Promise.resolve())).toBe(false);
  });

  // The defect this exists for: offline, a Firestore write promise never
  // settles, so awaiting it directly hangs the button forever.
  it("reports queued when the write never settles", async () => {
    vi.useFakeTimers();
    const neverSettles = new Promise(() => {});

    const result = ackOrQueued(neverSettles);
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS + 10);

    expect(await result).toBe(true);
  });

  it("waits for a slow ack rather than giving up early", async () => {
    vi.useFakeTimers();
    const slow = new Promise<void>((res) => setTimeout(res, ACK_TIMEOUT_MS - 500));

    const result = ackOrQueued(slow);
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);

    expect(await result).toBe(false);
  });

  // A rules refusal must still reach the caller, or the retry banner never
  // shows and the user is told their data is safe when it is not.
  it("rejects when the write genuinely fails", async () => {
    const denied = Promise.reject(new Error("permission-denied"));
    await expect(ackOrQueued(denied)).rejects.toThrow("permission-denied");
  });

  // Pins the `write.catch(() => {})` line in ackOrQueued, which looks like dead
  // code and is not: without it, a write that fails *after* we stopped waiting
  // is an unhandled rejection.
  //
  // `process` is reached through globalThis because this file is compiled with
  // the app's tsconfig, which has no Node types.
  it("does not leave an unhandled rejection when failure arrives after the timeout", async () => {
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    const proc = (globalThis as unknown as {
      process: {
        on(ev: string, fn: (e: unknown) => void): void;
        off(ev: string, fn: (e: unknown) => void): void;
      };
    }).process;
    proc.on("unhandledRejection", onUnhandled);

    const late = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("late failure")), ACK_TIMEOUT_MS + 1000)
    );
    const result = ackOrQueued(late);
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS + 10);
    expect(await result).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 10));
    proc.off("unhandledRejection", onUnhandled);

    expect(unhandled).toHaveLength(0);
  });

  it("clears its timer, so a resolved write leaves nothing pending", async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearTimeout");

    await ackOrQueued(Promise.resolve());

    expect(clear).toHaveBeenCalled();
  });
});
