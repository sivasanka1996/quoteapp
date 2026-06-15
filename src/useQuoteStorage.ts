import { useState } from "react";

export interface SavedQuote {
  id: string;
  name: string;       // customer name / label
  savedAt: number;    // timestamp ms
  lines: unknown;     // UILine[] — stored as-is
}

const STORAGE_KEY = "quoteapp_quotes";

function load(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(quotes: SavedQuote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}

export function useQuoteStorage() {
  const [quotes, setQuotes] = useState<SavedQuote[]>(load);

  function save(name: string, lines: unknown): SavedQuote {
    const entry: SavedQuote = {
      id: Date.now().toString(),
      name: name.trim() || "Untitled",
      savedAt: Date.now(),
      lines,
    };
    setQuotes((prev) => {
      const next = [entry, ...prev];
      persist(next);
      return next;
    });
    return entry;
  }

  function remove(id: string) {
    setQuotes((prev) => {
      const next = prev.filter((q) => q.id !== id);
      persist(next);
      return next;
    });
  }

  function update(id: string, name: string, lines: unknown) {
    setQuotes((prev) => {
      const next = prev.map((q) =>
        q.id === id ? { ...q, name: name.trim() || "Untitled", lines, savedAt: Date.now() } : q
      );
      persist(next);
      return next;
    });
  }

  return { quotes, save, remove, update };
}
