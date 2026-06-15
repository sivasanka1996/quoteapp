import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { type UILine, type QuoteDoc } from "./types";

export function useQuotes(customerId: string) {
  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    const q = query(
      collection(db, "quotes"),
      where("customerId", "==", customerId),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setQuotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuoteDoc)));
      setLoading(false);
    });
    return unsub;
  }, [customerId]);

  async function saveQuote(
    customerName: string,
    name: string,
    lines: UILine[],
    totalSale: number,
    existingId?: string
  ): Promise<string> {
    const now = Date.now();
    if (existingId) {
      await updateDoc(doc(db, "quotes", existingId), {
        name: name.trim() || "Untitled",
        lines,
        totalSale,
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
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async function deleteQuote(id: string) {
    await deleteDoc(doc(db, "quotes", id));
  }

  return { quotes, loading, saveQuote, deleteQuote };
}
