import { useMemo, useState } from "react";
import { type Customer } from "../types";
import { useCustomers } from "../shared/useCustomers";
import { useAllInvoices } from "../shared/useInvoices";
import { formatINR, formatDate } from "../format";
import { APP_VERSION } from "../appInfo";
// Reuses HomeScreen.css's "home-*" classes wholesale — this screen is the
// same customer-list shell as Quotations' HomeScreen, just rolling up
// invoices instead of quotes. See docs/billing.md's "Decisions made" for
// why this is a sibling file instead of a `kind` prop on HomeScreen itself.
import "../quotations/HomeScreen.css";

interface Props {
  onBack: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

interface CustomerStats {
  count: number;
  total: number;
  unpaidTotal: number;
  lastAt: number;
}

export function BillingHomeScreen({ onBack, onSelectCustomer }: Props) {
  const { customers, loading, addCustomer } = useCustomers();
  const { invoices } = useAllInvoices();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-customer rollups (invoice count/total/unpaid/last-billed date) for the list rows below
  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerStats>();
    for (const inv of invoices) {
      const prev = map.get(inv.customerId) ?? { count: 0, total: 0, unpaidTotal: 0, lastAt: 0 };
      map.set(inv.customerId, {
        count: prev.count + 1,
        total: prev.total + (inv.totalSale || 0),
        unpaidTotal: prev.unpaidTotal + (inv.paymentStatus !== "paid" ? inv.totalSale || 0 : 0),
        lastAt: Math.max(prev.lastAt, inv.updatedAt ?? inv.createdAt ?? 0),
      });
    }
    return map;
  }, [invoices]);

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
      <div className="home-top">
        <button className="home-back" onClick={onBack} aria-label="Back to dashboard">
          ←
        </button>
        <h1 className="home-section-title">Billing</h1>
      </div>

      <div className="home-section-head">
        <div>
          <h2>Customers</h2>
          <p>Tap a customer to view or create invoices</p>
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
                Add your first customer to start billing.
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
                      ? `${s.count} invoice${s.count === 1 ? "" : "s"}` +
                        (s.lastAt ? ` · Last: ${formatDate(s.lastAt)}` : "") +
                        (s.unpaidTotal > 0 ? ` · ₹${formatINR(s.unpaidTotal)} unpaid` : "")
                      : c.phone || "No invoices yet"}
                  </span>
                </span>
                {s && s.total > 0 && (
                  <span className="home-row-amount">
                    <span className="home-row-value tnum">
                      ₹{formatINR(s.total)}
                    </span>
                    <span className="home-row-value-label">Total billed</span>
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
