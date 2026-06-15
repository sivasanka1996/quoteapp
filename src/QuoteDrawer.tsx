import { useState } from "react";
import { type SavedQuote } from "./useQuoteStorage";
import "./QuoteDrawer.css";

interface Props {
  quotes: SavedQuote[];
  currentName: string;
  onSave: (name: string) => void;
  onLoad: (quote: SavedQuote) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function QuoteDrawer({ quotes, currentName, onSave, onLoad, onDelete, onClose }: Props) {
  const [name, setName] = useState(currentName);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <div className="qd-overlay" onClick={onClose}>
      <div className="qd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="qd-header">
          <h2>Quotes</h2>
          <button className="qd-close" onClick={onClose}>✕</button>
        </div>

        {/* Save current */}
        <div className="qd-save-row">
          <input
            className="qd-name-input"
            value={name}
            placeholder="Customer name / quote label"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="qd-btn-save"
            onClick={() => { onSave(name); onClose(); }}
          >
            Save
          </button>
        </div>

        {/* Saved list */}
        <div className="qd-list">
          {quotes.length === 0 ? (
            <p className="qd-empty">No saved quotes yet.</p>
          ) : (
            quotes.map((q) => (
              <div key={q.id} className="qd-item">
                <div className="qd-item-info" onClick={() => { onLoad(q); onClose(); }}>
                  <span className="qd-item-name">{q.name}</span>
                  <span className="qd-item-date">{formatDate(q.savedAt)}</span>
                </div>
                {deleteConfirm === q.id ? (
                  <div className="qd-confirm">
                    <span>Delete?</span>
                    <button className="qd-btn-yes" onClick={() => { onDelete(q.id); setDeleteConfirm(null); }}>Yes</button>
                    <button className="qd-btn-no" onClick={() => setDeleteConfirm(null)}>No</button>
                  </div>
                ) : (
                  <button className="qd-btn-del" onClick={() => setDeleteConfirm(q.id)}>🗑</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
