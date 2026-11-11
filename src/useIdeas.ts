import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from "firebase/firestore";
import { db } from "./firebase";
import { type IdeaDoc, type IdeaStatus, type IdeaService } from "./types";

export function useIdeas() {
  const [ideas, setIdeas] = useState<IdeaDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "ideas"),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as IdeaDoc));
        docs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setIdeas(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  async function addIdea(text: string, service: IdeaService): Promise<string> {
    const now = Date.now();
    const ref = await addDoc(collection(db, "ideas"), {
      text: text.trim(),
      status: "idea" as IdeaStatus,
      service,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async function setStatus(id: string, status: IdeaStatus) {
    await updateDoc(doc(db, "ideas", id), { status, updatedAt: Date.now() });
  }

  async function setService(id: string, service: IdeaService) {
    await updateDoc(doc(db, "ideas", id), { service, updatedAt: Date.now() });
  }

  async function deleteIdea(id: string) {
    await deleteDoc(doc(db, "ideas", id));
  }

  return { ideas, loading, addIdea, setStatus, setService, deleteIdea };
}
