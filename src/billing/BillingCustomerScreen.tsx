import { useMemo, useState } from "react";
import {
  type Customer, type InvoiceDoc, type PaymentStatus,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABEL,
} from "../types";
import { useInvoices } from "../shared/useInvoices";
import { formatINR, formatDate } from "../format";
import { PaymentStatusBadge } from "../shared/StatusBadge";
import { ImageReaderPanel } from "../shared/ImageReader";
import { VoiceReaderPanel } from "../shared/VoiceReader";
import { type ReadItem } from "../readImage";
// Reuses CustomerScreen.css's "cs-*" classes wholesale — same structure as
// Quotations' CustomerScreen, listing invoices instead of quotes. See
// docs/billing.md's "Decisions made".
import "../quotations/CustomerScreen.css";

interface Props {
  customer: Customer;
  onBack: () => void;
  onNewInvoice: () => void;
  onNewInvoiceFromItems: (items: ReadItem[]) => void;
  onOpenInvoice: (invoice: InvoiceDoc) => void;
}

type Filter = "all" | PaymentStatus;

export function BillingCustomerScreen({
  customer,
  onBack,
  onNewInvoice,
  onNewInvoiceFromItems,
  onOpenInvoice,
}: Props) {
  const { invoices, loading, deleteInvoice } = useInvoices(customer.id);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const totalValue = useMemo(
    () => invoices.reduce((s, inv) => s + (inv.totalSale || 0), 0),
    [invoices]
  );

  const visible = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((inv) => inv.paymentStatus === filter)),
    [invoices, filter]
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
              ? "Loading invoices…"
              : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}` +
                (totalValue > 0 ? ` · ₹${formatINR(totalValue)} total billed` : "")}
          </p>
          {(customer.phone || customer.address) && (
            <p className="cs-ident-contact">
              {[customer.phone, customer.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="cs-actions">
        <button className="cs-btn-primary" onClick={onNewInvoice}>
          + New Invoice
        </button>
        <button className="cs-btn-soft" onClick={() => setShowImageReader(true)}>
          <CameraIcon /> Read from Image
        </button>
        <button className="cs-btn-soft" onClick={() => setShowVoiceReader(true)}>
          <MicIcon /> Add by Voice
        </button>
      </div>

      <div className="cs-list-head">
        <h2>All Invoices</h2>
        <label className="cs-filter">
          <FilterIcon />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter invoices by payment status"
          >
            <option value="all">All statuses</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
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
      ) : invoices.length === 0 ? (
        <div className="cs-empty">
          <p className="cs-empty-title">No invoices yet</p>
          <p className="cs-empty-sub">
            Start one by hand, from a photo of the order list, or by speaking.
          </p>
          <button className="cs-btn-primary" onClick={onNewInvoice}>
            + Create first invoice
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="cs-empty">
          <p className="cs-empty-title">
            No {filter === "all" ? "" : PAYMENT_STATUS_LABEL[filter].toLowerCase()} invoices
          </p>
          <button className="cs-empty-clear" onClick={() => setFilter("all")}>
            Show all invoices
          </button>
        </div>
      ) : (
        <div className="cs-list">
          {visible.map((inv) => (
            <div className="cs-row" key={inv.id}>
              <button className="cs-row-main" onClick={() => onOpenInvoice(inv)}>
                <span className="cs-row-icon" aria-hidden="true">
                  <DocIcon />
                </span>
                <span className="cs-row-body">
                  <span className="cs-row-name">{inv.name || "Untitled"}</span>
                  <span className="cs-row-meta">
                    {inv.invoiceNumber} · {inv.lines?.length ?? 0} item
                    {(inv.lines?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                    {formatDate(inv.updatedAt ?? inv.createdAt)}
                  </span>
                </span>
                <span className="cs-row-right">
                  {inv.totalSale > 0 && (
                    <span className="cs-row-amount tnum">₹{formatINR(inv.totalSale)}</span>
                  )}
                  <PaymentStatusBadge status={inv.paymentStatus} />
                </span>
                <span className="cs-row-chev" aria-hidden="true">
                  <ChevronIcon />
                </span>
              </button>

              {deleteConfirm === inv.id ? (
                <div className="cs-confirm">
                  <span>Delete this invoice?</span>
                  <button
                    className="cs-del-yes"
                    onClick={() => {
                      deleteInvoice(inv.id);
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
                  onClick={() => setDeleteConfirm(inv.id)}
                  aria-label={`Delete invoice ${inv.name || "Untitled"}`}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <p className="cs-hint">Tap any invoice to open or edit it</p>
      )}

      {showImageReader && (
        <ImageReaderPanel
          onAdd={(items) => {
            setShowImageReader(false);
            onNewInvoiceFromItems(items);
          }}
          onClose={() => setShowImageReader(false)}
        />
      )}

      {showVoiceReader && (
        <VoiceReaderPanel
          onAdd={(item) => {
            setShowVoiceReader(false);
            onNewInvoiceFromItems([item]);
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
