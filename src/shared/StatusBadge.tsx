import {
  QUOTE_STATUSES, STATUS_LABEL, type QuoteStatus,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, type PaymentStatus,
} from "../types";
import "./StatusBadge.css";

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={`sb sb-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Tappable status picker — used in the quote editor. */
export function StatusPicker({
  status,
  onChange,
}: {
  status: QuoteStatus;
  onChange: (s: QuoteStatus) => void;
}) {
  return (
    <div className="sp" role="group" aria-label="Quote status">
      {QUOTE_STATUSES.map((s) => (
        <button
          key={s}
          className={`sp-btn sp-${s} ${status === s ? "is-active" : ""}`}
          aria-pressed={status === s}
          onClick={() => onChange(s)}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** Same pill as StatusBadge, for an invoice's payment status — see docs/billing.md. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`sb sb-pay-${status}`}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

/** Same picker as StatusPicker, for an invoice's payment status. */
export function PaymentStatusPicker({
  status,
  onChange,
}: {
  status: PaymentStatus;
  onChange: (s: PaymentStatus) => void;
}) {
  return (
    <div className="sp" role="group" aria-label="Payment status">
      {PAYMENT_STATUSES.map((s) => (
        <button
          key={s}
          className={`sp-btn sp-pay-${s} ${status === s ? "is-active" : ""}`}
          aria-pressed={status === s}
          onClick={() => onChange(s)}
        >
          {PAYMENT_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
