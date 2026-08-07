import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, getDocs, writeBatch,
  doc, orderBy, query, where, serverTimestamp, type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import { type Customer } from "./types";

/**
 * Delete a customer and every quote that belongs to them (bug #6).
 *
 * Deleting only the customer left their quotes in the collection: invisible in
 * the UI, because you reach a quote through its customer, but still counted in
 * the home stat tiles. One batch, so the customer and their quotes go together
 * or not at all — a half-finished delete is that same orphan state.
 *
 * A batch caps at 500 operations, so this handles 499 quotes for a single
 * customer. Past that `commit` throws and nothing is deleted, which is the
 * right way to fail: loud, and never half-done. Dad is nowhere near it.
 *
 * Takes `db` rather than reaching for the app's instance so `npm run
 * check:cascade` can drive this exact function from Node, where the app's
 * IndexedDB-backed cache cannot start. Production passes the app's `db`.
 */
export async function deleteCustomerAndQuotes(db: Firestore, customerId: string) {
  const theirs = await getDocs(
    query(collection(db, "quotes"), where("customerId", "==", customerId))
  );
  const batch = writeBatch(db);
  theirs.forEach((q) => batch.delete(q.ref));
  batch.delete(doc(db, "customers", customerId));
  await batch.commit();
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "customers"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer))
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  async function addCustomer(name: string, phone: string, address: string): Promise<string> {
    const ref = await addDoc(collection(db, "customers"), {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async function updateCustomer(id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>) {
    await updateDoc(doc(db, "customers", id), patch);
  }

  async function deleteCustomer(id: string) {
    await deleteCustomerAndQuotes(db, id);
  }

  return { customers, loading, addCustomer, updateCustomer, deleteCustomer };
}
