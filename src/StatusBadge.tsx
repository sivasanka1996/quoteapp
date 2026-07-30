import { QUOTE_STATUSES, STATUS_LABEL, type QuoteStatus } from "./types";
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
