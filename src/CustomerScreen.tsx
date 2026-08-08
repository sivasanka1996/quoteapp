import { useMemo, useState } from "react";
import {
  type Customer,
  type QuoteDoc,
  type QuoteStatus,
  QUOTE_STATUSES,
  STATUS_LABEL,
  quoteStatus,
  customerPatch,
} from "./types";
import { updateCustomerDoc } from "./useCustomers";
import { db } from "./firebase";
import { useQuotes } from "./useQuotes";
import { formatMoney, formatDate } from "./format";
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
  /**
   * Hand the corrected customer up to the router.
   *
   * Not optional and not decorative: the router holds the selected customer as
   * a snapshot in its own state and never re-reads it, so without this Dad would
   * save a corrected phone number and watch the screen keep showing the old one.
   */
  onCustomerChange: (customer: Customer) => void;
}

type Filter = "all" | QuoteStatus;

export function CustomerScreen({
  customer,
  onBack,
  onNewQuote,
  onNewQuoteFromItems,
  onOpenQuote,
  onCustomerChange,
}: Props) {
  const { quotes, loading, deleteQuote } = useQuotes(customer.id);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone ?? "");
  const [editAddress, setEditAddress] = useState(customer.address ?? "");
  const [editError, setEditError] = useState<string | null>(null);

  // Always open on what is stored, never on a half-typed draft from last time.
  function openEdit() {
    setEditName(customer.name);
    setEditPhone(customer.phone ?? "");
    setEditAddress(customer.address ?? "");
    setEditError(null);
    setShowEdit(true);
  }

  /**
   * Apply the edit locally, then let the write drain in its own time.
   *
   * Deliberately not awaited, and that is the PI-1 lesson rather than a shortcut:
   * Firestore resolves a write only on *server* ack, so `await` here would hang
   * the button forever with no signal — the same defect `saveQuote` needed
   * `ACK_TIMEOUT_MS` to dodge. It needs no ack race because it makes no promise
   * worth racing: nothing here tells Dad his data is safe, it just shows the
   * number he typed. The persistent cache has the write and replays it later.
   *
   * A genuine rejection — rules refusing us once PI-4.1 lands — reverts the
   * screen to the stored values and says so, rather than leaving the UI showing
   * a number Firestore never accepted.
   */
  function handleSaveEdit() {
    const patch = customerPatch(customer, editName, editPhone, editAddress);
    if (!patch) {
      setShowEdit(false); // nothing changed — closing is the whole outcome
      return;
    }
    const before = customer;
    setEditError(null);
    setShowEdit(false);
    onCustomerChange({ ...customer, ...patch });
    updateCustomerDoc(db, customer.id, patch).catch((err) => {
      onCustomerChange(before);
      setEditError(err instanceof Error ? err.message : String(err));
    });
  }

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
                (totalValue > 0 ? ` · ${formatMoney(totalValue)} total value` : "")}
          </p>
          {(customer.phone || customer.address) && (
            <p className="cs-ident-contact">
              {[customer.phone, customer.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button className="cs-edit-btn" onClick={openEdit} aria-label="Edit customer details">
          <PencilIcon />
        </button>
      </div>

      {editError && (
        <div className="cs-edit-error" role="alert">
          Could not save those details — {editError}. The customer is unchanged;
          try again.
        </div>
      )}

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
                    <span className="cs-row-amount tnum">{formatMoney(q.totalSale)}</span>
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

      {showEdit && (
        <div
          className="cs-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEdit(false);
          }}
        >
          <div className="cs-sheet">
            <div className="cs-sheet-header">
              <h2>Edit Customer</h2>
              <button
                className="cs-sheet-close"
                onClick={() => setShowEdit(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="cs-sheet-body">
              <label>
                <span>Name *</span>
                <input
                  value={editName}
                  placeholder="Customer / business name"
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={editPhone}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </label>
              <label>
                <span>Address</span>
                <input
                  value={editAddress}
                  placeholder="Area / city"
                  onChange={(e) => setEditAddress(e.target.value)}
                />
              </label>
              <p className="cs-sheet-note">
                These three print on every quotation this customer receives,
                including quotes already saved.
              </p>
            </div>
            <div className="cs-sheet-footer">
              <button className="cs-btn-cancel" onClick={() => setShowEdit(false)}>
                Cancel
              </button>
              <button
                className="cs-btn-save"
                onClick={handleSaveEdit}
                disabled={!editName.trim()}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
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

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z" />
      <path d="M14.5 7.5L16.5 9.5" />
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
