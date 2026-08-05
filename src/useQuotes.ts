import { useEffect, useState } from "react";
import {
  collection, onSnapshot, setDoc, updateDoc, deleteDoc,
  doc, query, where,
} from "firebase/firestore";
import { db } from "./firebase";
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
    const q = query(
      collection(db, "quotes"),
      where("customerId", "==", customerId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuoteDoc));
      docs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      setQuotes(docs);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [customerId]);

  async function saveQuote(
    customerName: string,
    name: string,
    lines: UILine[],
    totalSale: number,
    status: QuoteStatus,
    existingId?: string
  ): Promise<SaveResult> {
    const now = Date.now();
    if (existingId) {
      const write = updateDoc(doc(db, "quotes", existingId), {
        name: name.trim() || "Untitled",
        lines,
        totalSale,
        status,
        updatedAt: now,
      });
      return { id: existingId, queued: await ackOrQueued(write) };
    }
    // doc() mints the id on the device, so a new quote gets a stable id even
    // with no signal. addDoc would have had to wait for the server.
    const ref = doc(collection(db, "quotes"));
    const write = setDoc(ref, {
      customerId,
      customerName,
      name: name.trim() || "Untitled",
      lines,
      totalSale,
      status,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, queued: await ackOrQueued(write) };
  }

  async function setStatus(id: string, status: QuoteStatus) {
    await updateDoc(doc(db, "quotes", id), { status, updatedAt: Date.now() });
  }

  async function deleteQuote(id: string) {
    await deleteDoc(doc(db, "quotes", id));
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
    const unsub = onSnapshot(
      collection(db, "quotes"),
      (snap) => {
        setQuotes(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuoteDoc))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { quotes, loading };
}
