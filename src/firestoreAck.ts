// Racing a Firestore write against the clock.
//
// Firestore resolves a write promise only when the **server** has the data.
// With no signal that promise never settles — so `await setDoc(...)` hangs the
// button forever, and the user is left staring at "Saving…" with no idea
// whether their work is safe. The write is not lost: the persistent cache has
// already applied it locally and replays it when signal returns.
//
// So after a short wait we stop waiting and report the truth: stored locally,
// not yet confirmed. This was PI-1's fix for saving a quote; PI-5's ladder work
// found the same defect still live in the add-customer path (bug #10), which is
// why it now lives here instead of inside useQuotes.

/**
 * How long to wait for the server before calling a write saved-but-not-synced.
 *
 * Long enough that a healthy connection almost always acks first (so the common
 * case reports the plain truth), short enough that Dad is never left staring at
 * a stuck button.
 */
export const ACK_TIMEOUT_MS = 2500;

export interface WriteResult<T = string> {
  id: T;
  /** true = written locally and queued; the server has not confirmed yet */
  queued: boolean;
}

/**
 * Resolves `false` on server ack, `true` on timeout.
 *
 * Rejects only if the write **genuinely fails** — a rules refusal, say. That
 * distinction is the whole point: a real failure must still reach the caller so
 * it can show a retry, while "slow or offline" must not masquerade as one.
 */
export async function ackOrQueued(write: Promise<unknown>): Promise<boolean> {
  // A rejection arriving after the timeout would otherwise be unhandled.
  write.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), ACK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([write.then(() => false), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
