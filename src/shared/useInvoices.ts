import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, where, getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { type UILine, type InvoiceDoc, type PaymentStatus } from "../types";

// Placeholder invoice numbering: date + how many invoices already exist
// for today, read fresh at save time (not from a cache, since this hook
// only loads one customer's invoices — see docs/billing.md "Decisions
// made"). Fine for Dad's actual volume; swap for a real atomic counter
// if concurrent saves ever produce a collision.
async function nextInvoiceNumber(): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays = await getDocs(query(collection(db, "invoices"), where("createdAt", ">=", startOfDay)));
  const n = todays.size + 1;
  const ymd =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `INV-${ymd}-${String(n).padStart(2, "0")}`;
}

export function useInvoices(customerId: string) {
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    const q = query(
      collection(db, "invoices"),
      where("customerId", "==", customerId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceDoc));
      docs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      setInvoices(docs);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [customerId]);

  /**
   * Returns the saved invoice's id, plus its invoiceNumber — but only on
   * create. On update the number is unchanged, and the caller already has
   * it (from the InvoiceDoc it loaded), so there's no need for another read.
   */
  async function saveInvoice(
    customerName: string,
    name: string,
    lines: UILine[],
    totalSale: number,
    paymentStatus: PaymentStatus,
    existingId?: string,
    quoteId?: string
  ): Promise<{ id: string; invoiceNumber?: string }> {
    const now = Date.now();
    if (existingId) {
      await updateDoc(doc(db, "invoices", existingId), {
        name: name.trim() || "Untitled",
        lines,
        totalSale,
        paymentStatus,
        updatedAt: now,
      });
      return { id: existingId };
    }
    const invoiceNumber = await nextInvoiceNumber();
    const ref = await addDoc(collection(db, "invoices"), {
      customerId,
      customerName,
      name: name.trim() || "Untitled",
      invoiceNumber,
      ...(quoteId ? { quoteId } : {}),
      lines,
      totalSale,
      paymentStatus,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, invoiceNumber };
  }

  async function setPaymentStatus(id: string, paymentStatus: PaymentStatus) {
    await updateDoc(doc(db, "invoices", id), { paymentStatus, updatedAt: Date.now() });
  }

  async function deleteInvoice(id: string) {
    await deleteDoc(doc(db, "invoices", id));
  }

  return { invoices, loading, saveInvoice, setPaymentStatus, deleteInvoice };
}

/**
 * Every invoice across all customers — powers the Billing home screen rollups
 * and the Dashboard's unpaid-total stat. Read-only.
 */
export function useAllInvoices() {
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "invoices"),
      (snap) => {
        setInvoices(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceDoc))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { invoices, loading };
}
