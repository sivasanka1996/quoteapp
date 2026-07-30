import { useMemo, useState } from "react";
import {
  type Customer,
  type QuoteDoc,
  type QuoteStatus,
  QUOTE_STATUSES,
  STATUS_LABEL,
  quoteStatus,
} from "./types";
import { useQuotes } from "./useQuotes";
import { formatINR, formatDate } from "./format";
import { StatusBadge } from "./StatusBadge";
import { ImageReaderPanel } from "./ImageReader";
import { VoiceReaderPanel } from "./VoiceReader";
import { type ReadItem } from "./readImage";
import "./CustomerScreen.css";

interface Props {
  customer: Customer;
  onBack: () => void;
  onNewQuote: () => void;
  onNewQuoteFromItems: (items: ReadItem[]) => void;
  onOpenQuote: (quote: QuoteDoc) => void;
}

type Filter = "all" | QuoteStatus;

export function CustomerScreen({
  customer,
  onBack,
  onNewQuote,
  onNewQuoteFromItems,
  onOpenQuote,
}: Props) {
  const { quotes, loading, deleteQuote } = useQuotes(customer.id);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const totalValue = useMemo(
    () => quotes.reduce((s, q) => s + (q.totalSale || 0), 0),
    [quotes]
  );

  const visible = useMemo(
    () => (filter === "all" ? quotes : quotes.filter((q) => quoteStatus(q) === filter)),
    [quotes, filter]
  );

  return (
    <div className="cs">
      <div className="cs-top">
        <button className="cs-back" onClick={onBack} aria-label="Back to customers">
          ←
        </button>
        <div className="cs-ident">
          <h1>{customer.name}</h1>
          <p className="cs-ident-meta">
            {loading
              ? "Loading quotes…"
              : `${quotes.length} quote${quotes.length === 1 ? "" : "s"}` +
                (totalValue > 0 ? ` · ₹${formatINR(totalValue)} total value` : "")}
          </p>
          {(customer.phone || customer.address) && (
            <p className="cs-ident-contact">
              {[customer.phone, customer.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="cs-actions">
        <button className="cs-btn-primary" onClick={onNewQuote}>
          + New Quote
        </button>
        <button className="cs-btn-soft" onClick={() => setShowImageReader(true)}>
          <CameraIcon /> Read from Image
        </button>
        <button className="cs-btn-soft" onClick={() => setShowVoiceReader(true)}>
          <MicIcon /> Add by Voice
        </button>
      </div>

      <div className="cs-list-head">
        <h2>All Quotes</h2>
        <label className="cs-filter">
          <FilterIcon />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter quotes by status"
          >
            <option value="all">All statuses</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="cs-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="cs-skel" key={i} />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <div className="cs-empty">
          <p className="cs-empty-title">No quotes yet</p>
          <p className="cs-empty-sub">
            Start one by hand, from a photo of the order list, or by speaking.
          </p>
          <button className="cs-btn-primary" onClick={onNewQuote}>
            + Create first quote
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="cs-empty">
          <p className="cs-empty-title">
            No {filter === "all" ? "" : STATUS_LABEL[filter].toLowerCase()} quotes
          </p>
          <button className="cs-empty-clear" onClick={() => setFilter("all")}>
            Show all quotes
          </button>
        </div>
      ) : (
        <div className="cs-list">
          {visible.map((q) => (
            <div className="cs-row" key={q.id}>
              <button className="cs-row-main" onClick={() => onOpenQuote(q)}>
                <span className="cs-row-icon" aria-hidden="true">
                  <DocIcon />
                </span>
                <span className="cs-row-body">
                  <span className="cs-row-name">{q.name || "Untitled"}</span>
                  <span className="cs-row-meta">
                    {q.lines?.length ?? 0} item
                    {(q.lines?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                    {formatDate(q.updatedAt ?? q.createdAt)}
                  </span>
                </span>
                <span className="cs-row-right">
                  {q.totalSale > 0 && (
                    <span className="cs-row-amount tnum">₹{formatINR(q.totalSale)}</span>
                  )}
                  <StatusBadge status={quoteStatus(q)} />
                </span>
                <span className="cs-row-chev" aria-hidden="true">
                  <ChevronIcon />
                </span>
              </button>

              {deleteConfirm === q.id ? (
                <div className="cs-confirm">
                  <span>Delete this quote?</span>
                  <button
                    className="cs-del-yes"
                    onClick={() => {
                      deleteQuote(q.id);
                      setDeleteConfirm(null);
                    }}
                  >
                    Delete
                  </button>
                  <button className="cs-del-no" onClick={() => setDeleteConfirm(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="cs-del-btn"
                  onClick={() => setDeleteConfirm(q.id)}
                  aria-label={`Delete quote ${q.name || "Untitled"}`}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <p className="cs-hint">Tap any quote to open or edit it</p>
      )}

      {showImageReader && (
        <ImageReaderPanel
          onAdd={(items) => {
            setShowImageReader(false);
            onNewQuoteFromItems(items);
          }}
          onClose={() => setShowImageReader(false)}
        />
      )}

      {showVoiceReader && (
        <VoiceReaderPanel
          onAdd={(item) => {
            setShowVoiceReader(false);
            onNewQuoteFromItems([item]);
          }}
          onClose={() => setShowVoiceReader(false)}
        />
      )}
    </div>
  );
}

/* --- Icons --- */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4z" />
      <circle cx="12" cy="14" r="3.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0013 0M12 18.5V21" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 6h16l-6 7v6l-4-2v-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
