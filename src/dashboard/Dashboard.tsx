import { useMemo } from "react";
import { quoteStatus } from "../types";
import { useCustomers } from "../shared/useCustomers";
import { useAllQuotes } from "../shared/useQuotes";
import { useAllInvoices } from "../shared/useInvoices";
import { formatINRShort } from "../format";
import { APK_URL, APP_VERSION, isInstalledApp } from "../appInfo";
import "./Dashboard.css";

interface Props {
  onOpenQuotations: () => void;
  onOpenPricing: () => void;
  onOpenBilling: () => void;
}

/** App root: headline stat tiles, the APK banner, and tiles into each business section. */
export function Dashboard({ onOpenQuotations, onOpenPricing, onOpenBilling }: Props) {
  const { customers, loading: customersLoading } = useCustomers();
  const { quotes, loading: quotesLoading } = useAllQuotes();
  const { invoices, loading: invoicesLoading } = useAllInvoices();

  // The four headline figures — recomputed whenever quotes or the customer count changes
  const stats = useMemo(() => {
    const now = new Date();
    let thisMonth = 0;
    let pending = 0;
    let acceptedValue = 0;

    for (const q of quotes) {
      const created = new Date(q.createdAt ?? 0);
      if (
        created.getMonth() === now.getMonth() &&
        created.getFullYear() === now.getFullYear()
      ) {
        thisMonth++;
      }

      const st = quoteStatus(q);
      if (st === "draft" || st === "sent") pending++;
      if (st === "accepted") acceptedValue += q.totalSale || 0;
    }

    return { customers: customers.length, thisMonth, pending, acceptedValue };
  }, [quotes, customers.length]);

  // Unpaid total across all invoices — the one Billing figure that belongs on the
  // overview (everything else about an invoice is per-customer detail).
  const unpaidTotal = useMemo(
    () => invoices.reduce((s, inv) => s + (inv.paymentStatus !== "paid" ? inv.totalSale || 0 : 0), 0),
    [invoices]
  );

  return (
    <div className="db">
      <div className="db-stats">
        <StatTile
          label="Total Customers"
          value={customersLoading ? "—" : String(stats.customers)}
          icon="people"
        />
        <StatTile
          label="Quotes This Month"
          value={quotesLoading ? "—" : String(stats.thisMonth)}
          icon="doc"
        />
        <StatTile
          label="Pending Quotes"
          value={quotesLoading ? "—" : String(stats.pending)}
          icon="clock"
        />
        <StatTile
          label="Accepted Value"
          value={quotesLoading ? "—" : "₹" + formatINRShort(stats.acceptedValue)}
          icon="rupee"
        />
        <StatTile
          label="Unpaid Invoices"
          value={invoicesLoading ? "—" : "₹" + formatINRShort(unpaidTotal)}
          icon="rupee"
        />
      </div>

      {!isInstalledApp() && (
        <a className="db-apk" href={APK_URL} download="QuotationApp.apk">
          <span className="db-apk-icon" aria-hidden="true">
            <PhoneIcon />
          </span>
          <span className="db-apk-text">
            <span className="db-apk-title">Download Android App</span>
            <span className="db-apk-sub">Install directly on your phone</span>
          </span>
          <span className="db-apk-btn">Download</span>
        </a>
      )}

      <div className="db-section-head">
        <h2>Modules</h2>
      </div>

      <div className="db-tiles">
        <SectionTile
          title="Quotations"
          desc="Build and send quotes to customers"
          icon="doc"
          onClick={onOpenQuotations}
        />
        <SectionTile
          title="Pricing"
          desc="Vendor cost catalog, by item and brand"
          icon="tag"
          onClick={onOpenPricing}
        />
        <SectionTile
          title="Billing"
          desc="Invoices — standalone or converted from a quote"
          icon="rupee"
          onClick={onOpenBilling}
        />
      </div>

      <p className="db-footer">Quotation App · {APP_VERSION}</p>
    </div>
  );
}

/** One of the four headline numbers at the top of the dashboard. */
function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: "people" | "doc" | "clock" | "rupee";
}) {
  return (
    <div className="db-tile">
      <span className="db-tile-icon" aria-hidden="true">
        <TileIcon kind={icon} />
      </span>
      <span className="db-tile-value tnum">{value}</span>
      <span className="db-tile-label">{label}</span>
    </div>
  );
}

/** A card linking into one business section (Quotations/Pricing/Billing). */
function SectionTile({
  title,
  desc,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  desc: string;
  icon: "doc" | "tag" | "rupee";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="db-section-tile" onClick={onClick} disabled={disabled}>
      <span className="db-section-tile-icon" aria-hidden="true">
        <TileIcon kind={icon} />
      </span>
      <span className="db-section-tile-body">
        <span className="db-section-tile-title">{title}</span>
        <span className="db-section-tile-desc">{desc}</span>
      </span>
      {!disabled && (
        <span className="db-section-tile-chev" aria-hidden="true">
          <ChevronIcon />
        </span>
      )}
    </button>
  );
}

function TileIcon({ kind }: { kind: "people" | "doc" | "clock" | "rupee" | "tag" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "people")
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M16 11a3 3 0 100-6M17 19c0-2.2-.8-3.6-2-4.5" />
      </svg>
    );
  if (kind === "doc")
    return (
      <svg {...common}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h6" />
      </svg>
    );
  if (kind === "clock")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  if (kind === "tag")
    return (
      <svg {...common}>
        <path d="M11 3l9 9-8 8-9-9V4h7z" />
        <circle cx="8" cy="7" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8h2l6 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="6.5"
        y="2.5"
        width="11"
        height="19"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
