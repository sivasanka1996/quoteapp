import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { type Customer } from "./types";

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
    await deleteDoc(doc(db, "customers", id));
  }

  return { customers, loading, addCustomer, updateCustomer, deleteCustomer };
}
