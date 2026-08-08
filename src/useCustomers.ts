import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, getDocs, writeBatch,
  doc, orderBy, query, where, serverTimestamp, type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import { type Customer, type CustomerEdits } from "./types";

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
 * Takes `db` rather than reaching for the app's instance so
 * `npx vite-node scripts/cascade-check.ts` can drive this exact function from
 * Node, where the app's IndexedDB-backed cache cannot start. Production passes
 * the app's `db`.
 *
 * No screen calls this yet — `deleteCustomer` below is returned by the hook and
 * consumed by nobody, so the only live caller is that script. See CLAUDE.md's
 * note under KNOWN GAPS before assuming Dad can delete a customer in the app.
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

/**
 * Apply an edit to one customer.
 *
 * Standalone, like the delete above, so a screen can correct a customer without
 * opening a second `customers` snapshot listener just to reach the hook. Build
 * the patch with `customerPatch` — it decides what changed and refuses a blank
 * name; this function only writes what it is handed.
 *
 * No ack race here, unlike `saveQuote`, and callers must not `await` this to
 * drive a button: offline the promise never settles, because Firestore resolves
 * a write only on server ack. Nothing here claims Dad's data is safe, so there
 * is no promise worth racing — apply the change locally, let the persistent
 * cache replay the write, and treat a rejection as the rare real failure.
 */
export async function updateCustomerDoc(
  db: Firestore,
  customerId: string,
  patch: CustomerEdits
) {
  await updateDoc(doc(db, "customers", customerId), patch);
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

  async function updateCustomer(id: string, patch: CustomerEdits) {
    await updateCustomerDoc(db, id, patch);
  }

  async function deleteCustomer(id: string) {
    await deleteCustomerAndQuotes(db, id);
  }

  return { customers, loading, addCustomer, updateCustomer, deleteCustomer };
}
