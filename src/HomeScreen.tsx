import { useState } from "react";
import { type Customer } from "./types";
import { useCustomers } from "./useCustomers";
import "./HomeScreen.css";

interface Props {
  onSelectCustomer: (customer: Customer) => void;
}

export function HomeScreen({ onSelectCustomer }: Props) {
  const { customers, loading, addCustomer } = useCustomers();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = await addCustomer(newName, newPhone, newAddress);
    setSaving(false);
    setShowAdd(false);
    setNewName(""); setNewPhone(""); setNewAddress("");
    onSelectCustomer({ id, name: newName, phone: newPhone, address: newAddress, createdAt: Date.now() });
  }

  return (
    <div className="home">
      <header className="home-header">
        <h1>Quotation App</h1>
        <button className="home-btn-add" onClick={() => setShowAdd(true)}>
          + New Customer
        </button>
      </header>

      {/* Android app download banner */}
      <a className="home-apk-banner" href="https://github.com/sivasanka1996/quoteapp/releases/download/v1.4/app-debug.apk" download="QuotationApp.apk">
        <span className="home-apk-icon">📲</span>
        <div>
          <div className="home-apk-title">Download Android App</div>
          <div className="home-apk-sub">Install directly on your phone</div>
        </div>
        <span className="home-apk-arrow">↓</span>
      </a>

      <div className="home-search-wrap">
        <input
          className="home-search"
          value={search}
          placeholder="🔍  Search customers..."
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {loading ? (
        <p className="home-loading">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="home-empty">
          {search ? (
            <p>No customers match "<strong>{search}</strong>"</p>
          ) : (
            <p>No customers yet. Add your first customer above.</p>
          )}
        </div>
      ) : (
        <div className="home-list">
          {filtered.map((c) => (
            <button key={c.id} className="home-customer-card" onClick={() => onSelectCustomer(c)}>
              <div className="hcc-name">{c.name}</div>
              {(c.phone || c.address) && (
                <div className="hcc-meta">
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.address && <span>{c.address}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add customer sheet */}
      {showAdd && (
        <div className="home-overlay" onClick={() => setShowAdd(false)}>
          <div className="home-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="home-sheet-header">
              <h2>New Customer</h2>
              <button onClick={() => setShowAdd(false)}>✕</button>
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
              <button className="home-btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="home-btn-save" onClick={handleAdd} disabled={!newName.trim() || saving}>
                {saving ? "Saving..." : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
