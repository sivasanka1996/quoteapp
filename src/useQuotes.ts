import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { type UILine, type QuoteDoc, type QuoteStatus } from "./types";

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
  ): Promise<string> {
    const now = Date.now();
    if (existingId) {
      await updateDoc(doc(db, "quotes", existingId), {
        name: name.trim() || "Untitled",
        lines,
        totalSale,
        status,
        updatedAt: now,
      });
      return existingId;
    }
    const ref = await addDoc(collection(db, "quotes"), {
      customerId,
      customerName,
      name: name.trim() || "Untitled",
      lines,
      totalSale,
      status,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
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
