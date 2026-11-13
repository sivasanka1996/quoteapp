import { useMemo, useState } from "react";
import { calcQuote } from "../calc/engine";
import { formatINR, formatPct } from "../format";
import { CustomerView, type CustomerLine } from "../quotations/CustomerView";
import { useCompanySettings } from "../shared/useCompanySettings";
import { useInvoices } from "../shared/useInvoices";
import { PaymentStatusPicker } from "../shared/StatusBadge";
import { type UILine, type Customer, type InvoiceDoc, type PaymentStatus } from "../types";
import { ImageReaderPanel } from "../shared/ImageReader";
import { type ReadItem } from "../readImage";
import { VoiceReaderPanel, type VoiceItem } from "../shared/VoiceReader";
import { usePricing } from "../pricing/usePricing";
import { exactMatch } from "../shared/matchCatalog";
import {
  blankLine, toLineInput, costPatchFrom, catalogMatchFor, applyBlanket,
  type Blanket, type BlanketSide,
} from "../shared/lineHelpers";
import {
  LineRow, LineEditorSheet, Row,
  PlusIcon, CameraIcon, MicIcon,
} from "../shared/LineItemsEditor";
// Reuses QuoteEditor.css's "qe-*" classes wholesale — this screen is
// structurally identical to QuoteEditor, just saving to a different
// collection with a payment-status enum instead of a quote-status one.
// See docs/billing.md's "Decisions made" for why this is a sibling file
// instead of a `kind` prop on QuoteEditor itself.
import "../quotations/QuoteEditor.css";

// ---- Component ----

interface Props {
  customer: Customer;
  existingInvoice: InvoiceDoc | null;
  initialItems?: ReadItem[];
  /** Pre-filled lines when converting an accepted quote — see CustomerScreen's "Convert to Invoice". */
  initialLines?: UILine[];
  /** Set alongside initialLines; recorded on the invoice's first save only. */
  fromQuoteId?: string;
  onBack: () => void;
}

type ViewMode = "business" | "customer";

export function InvoiceEditor({
  customer, existingInvoice, initialItems, initialLines, fromQuoteId, onBack,
}: Props) {
  const initLines = (): UILine[] => {
    if (existingInvoice) return existingInvoice.lines;
    if (initialLines && initialLines.length > 0) return initialLines;
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((it) => ({
        ...blankLine(),
        name: it.name,
        qty: String(it.qty || 1),
        sellMode: "direct" as const,
        sellRate: it.rate != null ? String(it.rate) : "",
      }));
    }
    return [];
  };

  const [lines, setLines] = useState<UILine[]>(initLines);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [blanket, setBlanket] = useState<Blanket>({ side: "cost", disc1: "", disc2: "" });
  const [mode, setMode] = useState<ViewMode>("business");
  const [pendingShare, setPendingShare] = useState(false);
  const [invoiceName, setInvoiceName] = useState(existingInvoice?.name ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(existingInvoice?.paymentStatus ?? "unpaid");
  const [invoiceId, setInvoiceId] = useState<string | undefined>(existingInvoice?.id);
  const [invoiceNumber, setInvoiceNumber] = useState<string | undefined>(existingInvoice?.invoiceNumber);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { settings: company } = useCompanySettings();
  const { saveInvoice } = useInvoices(customer.id);
  const { items: catalogItems } = usePricing();
  const catalogHints = useMemo(
    () => catalogItems.map((c) => ({ id: c.id, name: c.name })),
    [catalogItems]
  );

  const { results, totals } = useMemo(() => {
    const { lines: results, totals } = calcQuote(lines.map(toLineInput));
    return { results, totals };
  }, [lines]);

  function updateLine(id: number, patch: Partial<UILine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setSavedAt(null);
  }
  function addLine() {
    const l = blankLine();
    setLines((prev) => [...prev, l]);
    setEditingId(l.id);
    setSavedAt(null);
  }
  function deleteLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setDeleteId(null);
    setSavedAt(null);
  }
  function toggleSelect(id: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function toggleSelectAll() {
    setSelected(selected.size === lines.length ? new Set() : new Set(lines.map((l) => l.id)));
  }
  function applyBlanketToAll() {
    setLines((prev) => prev.map((l) => ({ ...l, ...applyBlanket(l, blanket) })));
    setSavedAt(null);
  }
  function applyBlanketToSelected() {
    setLines((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, ...applyBlanket(l, blanket) } : l)));
    setSavedAt(null);
  }

  function handleAddFromVoice(voiceItem: VoiceItem) {
    const match = exactMatch(catalogItems, voiceItem.name);
    setLines((prev) => [...prev, {
      ...blankLine(),
      name: voiceItem.name,
      qty: String(voiceItem.qty || 1),
      sellMode: "direct" as const,
      sellRate: voiceItem.rate != null ? String(voiceItem.rate) : "",
      ...(match ? costPatchFrom(match) : {}),
    }]);
    setSavedAt(null);
  }

  function handleAddFromImage(readItems: ReadItem[]) {
    const newLines: UILine[] = readItems.map((it) => {
      const match = catalogMatchFor(catalogItems, it);
      return {
        ...blankLine(),
        name: it.name,
        qty: String(it.qty || 1),
        sellMode: "direct" as const,
        sellRate: it.rate != null ? String(it.rate) : "",
        ...(match ? costPatchFrom(match) : {}),
      };
    });
    setLines((prev) => [...prev, ...newLines]);
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveInvoice(
      customer.name,
      invoiceName || "Untitled",
      lines,
      totals.totalSale,
      paymentStatus,
      invoiceId,
      fromQuoteId
    );
    setInvoiceId(result.id);
    if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber);
    setSaving(false);
    setSavedAt(Date.now());
  }

  function handlePaymentStatusChange(s: PaymentStatus) {
    setPaymentStatus(s);
    setSavedAt(null);
  }

  const allSelected = lines.length > 0 && selected.size === lines.length;
  const someSelected = selected.size > 0 && !allSelected;

  const customerLines: CustomerLine[] = lines.map((l, i) => {
    const listPrice = parseFloat(l.sellList) || null;
    let sellDisc1 = "", sellDisc2 = "";
    if (l.sellMode === "discount") { sellDisc1 = l.sellDisc1; sellDisc2 = l.sellDisc2; }
    else if (listPrice && results[i].resolvedSell > 0) {
      const d = (1 - results[i].resolvedSell / listPrice) * 100;
      sellDisc1 = d > 0 ? d.toFixed(2) : "";
    }
    return { name: l.name, qty: parseInt(l.qty) || 0, listPrice, sellDisc1, sellDisc2, result: results[i] };
  });

  if (mode === "customer") {
    return (
      <CustomerView
        lines={customerLines}
        totals={totals}
        company={company}
        customerName={customer.name}
        quoteName={invoiceName || "Invoice"}
        documentTitle="Invoice"
        invoiceNumber={invoiceNumber}
        autoShare={pendingShare}
        onShareHandled={() => setPendingShare(false)}
        onClose={() => setMode("business")}
      />
    );
  }

  const editing = lines.find((l) => l.id === editingId) ?? null;
  const editingIndex = editing ? lines.findIndex((l) => l.id === editing.id) : -1;

  return (
    <div className="qe">
      <div className="qe-top">
        <button className="qe-back" onClick={onBack} aria-label="Back to invoices">←</button>
        <div className="qe-title-wrap">
          <span className="qe-customer">{customer.name}</span>
          <input
            className="qe-name"
            value={invoiceName}
            placeholder="Invoice name / label"
            onChange={(e) => { setInvoiceName(e.target.value); setSavedAt(null); }}
            aria-label="Invoice name"
          />
        </div>
        <div className="qe-top-actions">
          <div className="qe-viewtoggle" role="group" aria-label="View">
            <button className="is-active" aria-pressed="true">Business</button>
            <button onClick={() => setMode("customer")} aria-pressed="false">Customer</button>
          </div>
          <button className="qe-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : savedAt ? "Saved ✓" : invoiceId ? "Update" : "Save"}
          </button>
        </div>
      </div>

      <div className="qe-grid">
        <main className="qe-main">
          <div className="qe-items-head">
            <h2>Items</h2>
            <span className="qe-items-count">
              {lines.length} item{lines.length === 1 ? "" : "s"}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
          </div>

          {lines.length === 0 ? (
            <div className="qe-empty">
              <p className="qe-empty-title">No items yet</p>
              <p className="qe-empty-sub">
                Add them by hand, from a photo of the order list, or by speaking.
              </p>
              <div className="qe-empty-actions">
                <button className="qe-add qe-add-primary" onClick={addLine}>+ Add Item</button>
                <button className="qe-add" onClick={() => setShowImageReader(true)}>Read from Image</button>
                <button className="qe-add" onClick={() => setShowVoiceReader(true)}>Add by Voice</button>
              </div>
            </div>
          ) : (
            <>
              {lines.length > 1 && (
                <label className="qe-selectall">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                  />
                  <span>{allSelected ? "Deselect all" : "Select all"}</span>
                </label>
              )}

              <div className="qe-rows">
                {lines.map((l, i) => (
                  <LineRow
                    key={l.id}
                    index={i + 1}
                    line={l}
                    result={results[i]}
                    selected={selected.has(l.id)}
                    confirmingDelete={deleteId === l.id}
                    onToggleSelect={() => toggleSelect(l.id)}
                    onEdit={() => setEditingId(l.id)}
                    onAskDelete={() => setDeleteId(l.id)}
                    onCancelDelete={() => setDeleteId(null)}
                    onConfirmDelete={() => deleteLine(l.id)}
                  />
                ))}
              </div>

              <div className="qe-addrow">
                <button className="qe-add" onClick={addLine}>
                  <PlusIcon /> Add Item
                </button>
                <button className="qe-add qe-add-soft" onClick={() => setShowImageReader(true)}>
                  <CameraIcon /> Read from Image
                </button>
                <button className="qe-add qe-add-soft" onClick={() => setShowVoiceReader(true)}>
                  <MicIcon /> Add by Voice
                </button>
              </div>
            </>
          )}
        </main>

        <aside className="qe-aside">
          <section className="qe-card">
            <h3>Blanket Discount</h3>
            <div className="qe-seg" role="group" aria-label="Apply discount to">
              {(["cost", "sell", "both"] as BlanketSide[]).map((s) => (
                <button
                  key={s}
                  className={blanket.side === s ? "is-active" : ""}
                  aria-pressed={blanket.side === s}
                  onClick={() => setBlanket((b) => ({ ...b, side: s }))}
                >
                  {s === "cost" ? "Cost" : s === "sell" ? "Sell" : "Both"}
                </button>
              ))}
            </div>
            <input
              className="qe-input num"
              value={blanket.disc1}
              placeholder="Discount % — e.g. 64.7"
              inputMode="decimal"
              aria-label="Discount percent"
              onChange={(e) => setBlanket((b) => ({ ...b, disc1: e.target.value }))}
            />
            <input
              className="qe-input num"
              value={blanket.disc2}
              placeholder="Extra discount % — e.g. 2"
              inputMode="decimal"
              aria-label="Extra discount percent"
              onChange={(e) => setBlanket((b) => ({ ...b, disc2: e.target.value }))}
            />
            <button
              className="qe-btn-primary"
              onClick={applyBlanketToAll}
              disabled={lines.length === 0}
            >
              Apply to All
            </button>
            <button
              className="qe-btn-ghost"
              onClick={applyBlanketToSelected}
              disabled={selected.size === 0}
            >
              Apply to selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <p className="qe-note">Discounts compound: list × (1−d1) × (1−d2)</p>
          </section>

          <section className="qe-card">
            <h3>Payment status</h3>
            <PaymentStatusPicker status={paymentStatus} onChange={handlePaymentStatusChange} />
          </section>

          <section className="qe-card">
            <h3>Summary</h3>
            <dl className="qe-summary">
              <Row label="Total cost" value={formatINR(totals.totalCost)} tone="cost" />
              <Row label="Subtotal (sale)" value={formatINR(totals.totalSale)} tone="sell" />
              <Row label="GST" value={formatINR(totals.totalGst)} tone="gst" />
              <Row label="Grand total" value={formatINR(totals.grandTotal)} strong />
            </dl>
          </section>

          <section className={"qe-card qe-profit" + (totals.grossProfit < 0 ? " is-loss" : "")}>
            <h3>Profit</h3>
            <div className="qe-profit-value tnum">{formatINR(totals.grossProfit)}</div>
            <div className="qe-profit-meta">
              <span>On cost {formatPct(totals.profitOnCostPct)}</span>
              <span>On sales {formatPct(totals.profitOnSalesPct)}</span>
            </div>
            <p className="qe-note">Pre-GST. GST is passed through and never counted as profit.</p>
          </section>

          <button
            className="qe-btn-primary qe-btn-big"
            onClick={() => setMode("customer")}
            disabled={lines.length === 0}
          >
            Send to Customer
          </button>
          <button
            className="qe-btn-soft qe-btn-big"
            onClick={() => { setPendingShare(true); setMode("customer"); }}
            disabled={lines.length === 0}
          >
            Share as PDF / WhatsApp
          </button>
        </aside>
      </div>

      {/* Mobile-only sticky footer — total and save always reachable */}
      <div className="qe-stickybar">
        <div className="qe-stickybar-total">
          <span>Grand total</span>
          <strong className="tnum">{formatINR(totals.grandTotal)}</strong>
        </div>
        <button className="qe-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : savedAt ? "Saved ✓" : invoiceId ? "Update" : "Save"}
        </button>
      </div>

      {editing && (
        <LineEditorSheet
          line={editing}
          index={editingIndex + 1}
          result={results[editingIndex]}
          catalogItems={catalogItems}
          onChange={(patch) => updateLine(editing.id, patch)}
          onDelete={() => { deleteLine(editing.id); setEditingId(null); }}
          onClose={() => setEditingId(null)}
        />
      )}

      {showImageReader && (
        <ImageReaderPanel
          onAdd={handleAddFromImage}
          onClose={() => setShowImageReader(false)}
          catalog={catalogHints}
        />
      )}
      {showVoiceReader && (
        <VoiceReaderPanel onAdd={handleAddFromVoice} onClose={() => setShowVoiceReader(false)} />
      )}
    </div>
  );
}
