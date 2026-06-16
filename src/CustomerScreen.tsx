import { useState } from "react";
import { type Customer, type QuoteDoc } from "./types";
import { useQuotes } from "./useQuotes";
import { formatINR } from "./format";
import { ImageReaderPanel } from "./ImageReader";
import { type ReadItem } from "./readImage";
import "./CustomerScreen.css";

interface Props {
  customer: Customer;
  onBack: () => void;
  onNewQuote: () => void;
  onNewQuoteFromImage: (items: ReadItem[]) => void;
  onOpenQuote: (quote: QuoteDoc) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function CustomerScreen({ customer, onBack, onNewQuote, onNewQuoteFromImage, onOpenQuote }: Props) {
  const { quotes, loading, deleteQuote } = useQuotes(customer.id);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);

  return (
    <div className="cs-screen">
      <header className="cs-header">
        <button className="cs-back" onClick={onBack}>←</button>
        <div className="cs-customer-info">
          <h1>{customer.name}</h1>
          {customer.phone && <span className="cs-phone">📞 {customer.phone}</span>}
          {customer.address && <span className="cs-addr">{customer.address}</span>}
        </div>
        <div className="cs-header-actions">
          <button className="cs-btn-photo" onClick={() => setShowImageReader(true)}>📷 Take photo</button>
          <button className="cs-btn-new" onClick={onNewQuote}>+ New Quote</button>
        </div>
      </header>

      {showImageReader && (
        <ImageReaderPanel
          onAdd={(items) => { setShowImageReader(false); onNewQuoteFromImage(items); }}
          onClose={() => setShowImageReader(false)}
        />
      )}

      <div className="cs-body">
        {loading ? (
          <p className="cs-loading">Loading quotes...</p>
        ) : quotes.length === 0 ? (
          <div className="cs-empty">
            <p>No quotes yet for this customer.</p>
            <button className="cs-btn-new-big" onClick={onNewQuote}>+ Create first quote</button>
          </div>
        ) : (
          <div className="cs-list">
            {quotes.map((q) => (
              <div key={q.id} className="cs-quote-card">
                <div className="cs-quote-main" onClick={() => onOpenQuote(q)}>
                  <div className="cs-quote-name">{q.name}</div>
                  <div className="cs-quote-meta">
                    <span>{formatDate(q.updatedAt)}</span>
                    {q.totalSale > 0 && (
                      <span className="cs-quote-amount">₹{formatINR(q.totalSale)}</span>
                    )}
                  </div>
                </div>
                {deleteConfirm === q.id ? (
                  <div className="cs-confirm">
                    <span>Delete?</span>
                    <button className="cs-del-yes" onClick={() => { deleteQuote(q.id); setDeleteConfirm(null); }}>Yes</button>
                    <button className="cs-del-no" onClick={() => setDeleteConfirm(null)}>No</button>
                  </div>
                ) : (
                  <button className="cs-del-btn" onClick={() => setDeleteConfirm(q.id)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
