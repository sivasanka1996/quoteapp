import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query,
} from "firebase/firestore";
import { db } from "../firebase";
import { type ItemDoc } from "../types";

export function blankItem(): Omit<ItemDoc, "id" | "updatedAt"> {
  return {
    name: "", brand: "", unit: "",
    costMode: "direct", costList: "", costDisc1: "", costDisc2: "", costRate: "",
    source: "manual",
  };
}

export function usePricing() {
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "items"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ItemDoc)));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function addItem(item: Omit<ItemDoc, "id" | "updatedAt">): Promise<string> {
    const ref = await addDoc(collection(db, "items"), {
      ...item,
      updatedAt: Date.now(),
    });
    return ref.id;
  }

  async function updateItem(id: string, patch: Partial<Omit<ItemDoc, "id">>) {
    await updateDoc(doc(db, "items", id), { ...patch, updatedAt: Date.now() });
  }

  async function deleteItem(id: string) {
    await deleteDoc(doc(db, "items", id));
  }

  // Merge a scanned vendor price list into the catalog. A whole upload is
  // one brand — Dad declares it once before uploading rather than the
  // image reader trying to read a brand name off the document, which
  // often isn't printed per line anyway. Match against the existing
  // catalog for that brand: prefer Gemini's own `catalogId` (it saw the
  // full brand-scoped catalog and the image together, so it can match by
  // meaning through OCR noise/abbreviations), falling back to exact
  // name+brand text if that's absent — see "Decisions made" in
  // docs/pricing.md. Either way: match → update that row's cost rate, no
  // match → insert a new catalog entry. The scanned "rate" is the
  // vendor's cost, not a sell price — sell/discount stays in the quote
  // tool.
  async function mergeFromImage(
    scanned: { name: string; rate: number | null; catalogId?: string | null }[],
    brand: string
  ) {
    const b = brand.trim();
    for (const it of scanned) {
      const name = it.name.trim();
      if (!name) continue;
      const byId = it.catalogId ? items.find((x) => x.id === it.catalogId) : undefined;
      const existing = byId ?? items.find(
        (x) =>
          x.name.trim().toLowerCase() === name.toLowerCase() &&
          x.brand.trim().toLowerCase() === b.toLowerCase()
      );
      if (existing) {
        await updateItem(existing.id, {
          costMode: "direct",
          costRate: it.rate != null ? String(it.rate) : existing.costRate,
        });
      } else {
        await addItem({
          ...blankItem(),
          name,
          brand: b,
          costMode: "direct",
          costRate: it.rate != null ? String(it.rate) : "",
          source: "image",
        });
      }
    }
  }

  return { items, loading, addItem, updateItem, deleteItem, mergeFromImage };
}
