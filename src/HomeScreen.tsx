import { useMemo, useState } from "react";
import { type Customer, quoteStatus } from "./types";
import { useCustomers } from "./useCustomers";
import { useAllQuotes } from "./useQuotes";
import { formatINR, formatINRShort, formatDate } from "./format";
import { APK_URL, APP_VERSION, isInstalledApp } from "./appInfo";
import "./HomeScreen.css";

interface Props {
  onSelectCustomer: (customer: Customer) => void;
}

interface CustomerStats {
  count: number;
  total: number;
  lastAt: number;
}

export function HomeScreen({ onSelectCustomer }: Props) {
  const { customers, loading, addCustomer } = useCustomers();
  const { quotes, loading: quotesLoading } = useAllQuotes();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-customer rollups, plus the four headline figures
  const { byCustomer, stats } = useMemo(() => {
    const byCustomer = new Map<string, CustomerStats>();
    const now = new Date();
    let thisMonth = 0;
    let pending = 0;
    let acceptedValue = 0;

    for (const q of quotes) {
      const prev = byCustomer.get(q.customerId) ?? { count: 0, total: 0, lastAt: 0 };
      byCustomer.set(q.customerId, {
        count: prev.count + 1,
        total: prev.total + (q.totalSale || 0),
        lastAt: Math.max(prev.lastAt, q.updatedAt ?? q.createdAt ?? 0),
      });

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

    return {
      byCustomer,
      stats: {
        customers: customers.length,
        thisMonth,
        pending,
        acceptedValue,
      },
    };
  }, [quotes, customers.length]);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = await addCustomer(newName, newPhone, newAddress);
    setSaving(false);
    setShowAdd(false);
    setNewName("");
    setNewPhone("");
    setNewAddress("");
    onSelectCustomer({
      id,
      name: newName,
      phone: newPhone,
      address: newAddress,
      createdAt: Date.now(),
    });
  }

  return (
    <div className="home">
      <div className="home-stats">
        <StatTile
          label="Total Customers"
          value={loading ? "—" : String(stats.customers)}
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
      </div>

      {!isInstalledApp() && (
        <a className="home-apk" href={APK_URL} download="QuotationApp.apk">
          <span className="home-apk-icon" aria-hidden="true">
            <PhoneIcon />
          </span>
          <span className="home-apk-text">
            <span className="home-apk-title">Download Android App</span>
            <span className="home-apk-sub">Install directly on your phone</span>
          </span>
          <span className="home-apk-btn">Download</span>
        </a>
      )}

      <div className="home-section-head">
        <div>
          <h2>Customers</h2>
          <p>Tap a customer to view or create quotes</p>
        </div>
        <button className="home-btn-add" onClick={() => setShowAdd(true)}>
          + New Customer
        </button>
      </div>

      <div className="home-search-wrap">
        <span className="home-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          className="home-search"
          value={search}
          placeholder="Search customers..."
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          aria-label="Search customers"
        />
      </div>

      {loading ? (
        <div className="home-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="home-skel" key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="home-empty">
          {search ? (
            <>
              <p className="home-empty-title">No customers match “{search}”</p>
              <button className="home-empty-clear" onClick={() => setSearch("")}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="home-empty-title">No customers yet</p>
              <p className="home-empty-sub">
                Add your first customer to start quoting.
              </p>
              <button className="home-btn-add" onClick={() => setShowAdd(true)}>
                + New Customer
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="home-list">
          {filtered.map((c) => {
            const s = byCustomer.get(c.id);
            return (
              <button
                key={c.id}
                className="home-row"
                onClick={() => onSelectCustomer(c)}
              >
                <span className="home-avatar" aria-hidden="true">
                  {initials(c.name)}
                </span>
                <span className="home-row-main">
                  <span className="home-row-name">{c.name}</span>
                  <span className="home-row-meta">
                    {s
                      ? `${s.count} quote${s.count === 1 ? "" : "s"}` +
                        (s.lastAt ? ` · Last: ${formatDate(s.lastAt)}` : "")
                      : c.phone || "No quotes yet"}
                  </span>
                </span>
                {s && s.total > 0 && (
                  <span className="home-row-amount">
                    <span className="home-row-value tnum">
                      ₹{formatINR(s.total)}
                    </span>
                    <span className="home-row-value-label">Total value</span>
                  </span>
                )}
                <span className="home-row-chev" aria-hidden="true">
                  <ChevronIcon />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="home-footer">Quotation App · {APP_VERSION}</p>

      {showAdd && (
        <div
          className="home-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAdd(false);
          }}
        >
          <div className="home-sheet">
            <div className="home-sheet-header">
              <h2>New Customer</h2>
              <button
                className="home-sheet-close"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="home-sheet-body">
              <label>
                <span>Name *</span>
                <input
                  value={newName}
                  placeholder="Customer / business name"
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={newPhone}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </label>
              <label>
                <span>Address</span>
                <input
                  value={newAddress}
                  placeholder="Area / city"
                  onChange={(e) => setNewAddress(e.target.value)}
                />
              </label>
            </div>
            <div className="home-sheet-footer">
              <button
                className="home-btn-cancel"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
              <button
                className="home-btn-save"
                onClick={handleAdd}
                disabled={!newName.trim() || saving}
              >
                {saving ? "Saving..." : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
    <div className="home-tile">
      <span className="home-tile-icon" aria-hidden="true">
        <TileIcon kind={icon} />
      </span>
      <span className="home-tile-value tnum">{value}</span>
      <span className="home-tile-label">{label}</span>
    </div>
  );
}

function TileIcon({ kind }: { kind: "people" | "doc" | "clock" | "rupee" }) {
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
  return (
    <svg {...common}>
      <path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8h2l6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
