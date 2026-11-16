import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { type FeedbackDoc, type FeedbackStatus } from "../types";

export function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "feedback"),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackDoc));
        docs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setFeedback(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  async function addFeedback(text: string, page: string): Promise<string> {
    const now = Date.now();
    const ref = await addDoc(collection(db, "feedback"), {
      text: text.trim(),
      status: "pending" as FeedbackStatus,
      page,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  return { feedback, loading, addFeedback };
}
