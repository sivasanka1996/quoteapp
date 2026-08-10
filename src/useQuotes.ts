import { useEffect, useState } from "react";
import {
  collection, onSnapshot, setDoc, updateDoc, deleteDoc,
  doc, query, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { log } from "./log/logger";
import { type UILine, type QuoteDoc, type QuoteStatus } from "./types";

/**
 * How long to wait for the server to acknowledge a write before calling it
 * saved-but-not-synced.
 *
 * Firestore resolves a write promise only when the *server* has the data.
 * Offline that promise never settles, so awaiting it hangs the Save button
 * forever. The write is not lost — the persistent cache has already applied
 * it locally and will replay it when signal returns — so after this long we
 * report success and say it will sync.
 */
const ACK_TIMEOUT_MS = 2500;

export interface SaveResult {
  id: string;
  /** true = written locally and queued; the server has not confirmed yet */
  queued: boolean;
}

/** Resolves false on ack, true on timeout. Rejects if the write genuinely fails. */
async function ackOrQueued(write: Promise<unknown>): Promise<boolean> {
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

export function useQuotes(customerId: string) {
  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    try {
      const q = query(
        collection(db, "quotes"),
        where("customerId", "==", customerId)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          try {
            const docs = snap.docs.map(
              (d) => ({ id: d.id, ...d.data() } as QuoteDoc)
            );
            docs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
            setQuotes(docs);
            log.debug("firestore", "quotes snapshot", {
              customerId,
              count: docs.length,
              fromCache: snap.metadata.fromCache,
            });
          } catch (e) {
            log.error("firestore", "quotes snapshot could not be read", e, {
              customerId,
            });
          } finally {
            setLoading(false);
          }
        },
        (e) => {
          // Was a bare `() => setLoading(false)`: the listener failing looked
          // exactly like an empty list. Now it leaves a trace.
          log.error("firestore", "quotes listener failed", e, { customerId });
          setLoading(false);
        }
      );
      return unsub;
    } catch (e) {
      // Log, then let it through — see the note in useCustomers. A listener
      // that cannot attach is a broken data layer, and the ErrorBoundary card
      // beats a spinner that never stops.
      log.error("firestore", "quotes listener could not be attached", e, {
        customerId,
      });
      throw e;
    }
  }, [customerId]);

  async function saveQuote(
    customerName: string,
    name: string,
    lines: UILine[],
    totalSale: number,
    status: QuoteStatus,
    existingId?: string,
    // The editor mints this when it opens, so the quote number printed on a
    // PDF shared before the first save matches the document that gets stored.
    createdAt?: number
  ): Promise<SaveResult> {
    const now = Date.now();
    // I/O layer (spec §2.4): log, then re-throw. The editor's retry banner is
    // driven by this promise rejecting, so swallowing here would tell Dad the
    // quote saved when it did not.
    try {
      if (existingId) {
        const write = updateDoc(doc(db, "quotes", existingId), {
          name: name.trim(),
          lines,
          totalSale,
          status,
          updatedAt: now,
        });
        const queued = await ackOrQueued(write);
        log.info("firestore", "quote saved", {
          id: existingId,
          queued,
          lineCount: lines.length,
          totalSale,
          status,
          isNew: false,
        });
        return { id: existingId, queued };
      }
      // doc() mints the id on the device, so a new quote gets a stable id even
      // with no signal. addDoc would have had to wait for the server.
      const ref = doc(collection(db, "quotes"));
      const write = setDoc(ref, {
        customerId,
        customerName,
        name: name.trim(),
        lines,
        totalSale,
        status,
        createdAt: createdAt ?? now,
        updatedAt: now,
      });
      const queued = await ackOrQueued(write);
      log.info("firestore", "quote saved", {
        id: ref.id,
        queued,
        lineCount: lines.length,
        totalSale,
        status,
        isNew: true,
      });
      return { id: ref.id, queued };
    } catch (e) {
      log.error("firestore", "quote save failed", e, {
        id: existingId,
        customerId,
        lineCount: lines.length,
      });
      throw e;
    }
  }

  async function setStatus(id: string, status: QuoteStatus) {
    try {
      await updateDoc(doc(db, "quotes", id), { status, updatedAt: Date.now() });
      log.info("firestore", "quote status changed", { id, status });
    } catch (e) {
      log.error("firestore", "quote status change failed", e, { id, status });
      throw e;
    }
  }

  async function deleteQuote(id: string) {
    try {
      await deleteDoc(doc(db, "quotes", id));
      log.info("firestore", "quote deleted", { id });
    } catch (e) {
      log.error("firestore", "quote delete failed", e, { id });
      throw e;
    }
  }

  return { quotes, loading, saveQuote, setStatus, deleteQuote };
}

/**
 * Every quote across all customers — powers the home screen stat tiles and the
 * per-customer counts. Read-only.
 */
export function useAllQuotes() {
  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        collection(db, "quotes"),
        (snap) => {
          try {
            setQuotes(
              snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuoteDoc))
            );
            log.debug("firestore", "all-quotes snapshot", {
              count: snap.docs.length,
              fromCache: snap.metadata.fromCache,
            });
          } catch (e) {
            log.error("firestore", "all-quotes snapshot could not be read", e);
          } finally {
            setLoading(false);
          }
        },
        (e) => {
          log.error("firestore", "all-quotes listener failed", e);
          setLoading(false);
        }
      );
      return unsub;
    } catch (e) {
      log.error("firestore", "all-quotes listener could not be attached", e);
      throw e;
    }
  }, []);

  return { quotes, loading };
}
