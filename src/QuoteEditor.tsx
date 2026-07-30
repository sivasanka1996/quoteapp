import { useMemo, useState } from "react";
import { calcQuote, type LineInput, type LineResult, type PriceMode } from "./calc/engine";
import { formatINR, formatPct } from "./format";
import { CustomerView, type CustomerLine } from "./CustomerView";
import { useCompanySettings } from "./useCompanySettings";
import { useQuotes } from "./useQuotes";
import { StatusPicker } from "./StatusBadge";
import { type UILine, type Customer, type QuoteDoc, type QuoteStatus } from "./types";
import { ImageReaderPanel } from "./ImageReader";
import { type ReadItem } from "./readImage";
import { VoiceReaderPanel, type VoiceItem } from "./VoiceReader";
import "./QuoteEditor.css";

// ---- Helpers ----

let nextId = 1;
function blankLine(): UILine {
  return {
    id: nextId++, name: "", qty: "",
    costMode: "discount", costList: "", costDisc1: "", costDisc2: "", costRate: "",
    sellMode: "direct", sellList: "", sellDisc1: "", sellDisc2: "", sellRate: "",
    gstPct: "18",
  };
}

function buildDiscountExpr(d1: string, d2: string): string {
  const v1 = parseFloat(d1), v2 = parseFloat(d2);
  if (!v1 && !v2) return "0%";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}%`;
}

function toPriceMode(
  mode: "discount" | "direct", list: string,
  disc1: string, disc2: string, rate: string
): PriceMode {
  if (mode === "direct") return { kind: "direct", rate: parseFloat(rate) || 0 };
  return { kind: "discount", listPrice: parseFloat(list) || 0, discountExpr: buildDiscountExpr(disc1, disc2) };
}

function toLineInput(l: UILine): LineInput {
  return {
    name: l.name, qty: parseInt(l.qty) || 0,
    cost: toPriceMode(l.costMode, l.costList, l.costDisc1, l.costDisc2, l.costRate),
    sell: toPriceMode(l.sellMode, l.sellList, l.sellDisc1, l.sellDisc2, l.sellRate),
    gstPct: parseFloat(l.gstPct) || 0,
  };
}

/** "64.7% + 2%" for display, or "" when there is no discount */
function discountLabel(d1: string, d2: string): string {
  const v1 = parseFloat(d1), v2 = parseFloat(d2);
  if (!v1 && !v2) return "";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}% off`;
}

type BlanketSide = "cost" | "sell" | "both";
interface Blanket { side: BlanketSide; disc1: string; disc2: string; }

function applyBlanket(_l: UILine, b: Blanket): Partial<UILine> {
  const p: Partial<UILine> = {};
  if (b.side === "cost" || b.side === "both") { p.costMode = "discount"; p.costDisc1 = b.disc1; p.costDisc2 = b.disc2; }
  if (b.side === "sell" || b.side === "both") { p.sellMode = "discount"; p.sellDisc1 = b.disc1; p.sellDisc2 = b.disc2; }
  return p;
}

// ---- Component ----

interface Props {
  customer: Customer;
  existingQuote: QuoteDoc | null;
  initialItems?: ReadItem[];
  onBack: () => void;
}

type ViewMode = "business" | "customer";

export function QuoteEditor({ customer, existingQuote, initialItems, onBack }: Props) {
  const initLines = (): UILine[] => {
    if (existingQuote) return existingQuote.lines;
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
  const [quoteName, setQuoteName] = useState(existingQuote?.name ?? "");
  const [status, setStatus] = useState<QuoteStatus>(existingQuote?.status ?? "draft");
  const [quoteId, setQuoteId] = useState<string | undefined>(existingQuote?.id);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { settings: company } = useCompanySettings();
  const { saveQuote } = useQuotes(customer.id);

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
    setLines((prev) => [...prev, {
      ...blankLine(),
      name: voiceItem.name,
      qty: String(voiceItem.qty || 1),
      sellMode: "direct" as const,
      sellRate: voiceItem.rate != null ? String(voiceItem.rate) : "",
    }]);
    setSavedAt(null);
  }

  function handleAddFromImage(readItems: ReadItem[]) {
    const newLines: UILine[] = readItems.map((it) => ({
      ...blankLine(),
      name: it.name,
      qty: String(it.qty || 1),
      sellMode: "direct" as const,
      sellRate: it.rate != null ? String(it.rate) : "",
    }));
    setLines((prev) => [...prev, ...newLines]);
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    const id = await saveQuote(
      customer.name,
      quoteName || "Untitled",
      lines,
      totals.totalSale,
      status,
      quoteId
    );
    setQuoteId(id);
    setSaving(false);
    setSavedAt(Date.now());
  }

  function handleStatusChange(s: QuoteStatus) {
    setStatus(s);
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
        quoteName={quoteName || "Quotation"}
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
        <button className="qe-back" onClick={onBack} aria-label="Back to quotes">←</button>
        <div className="qe-title-wrap">
          <span className="qe-customer">{customer.name}</span>
          <input
            className="qe-name"
            value={quoteName}
            placeholder="Quote name / label"
            onChange={(e) => { setQuoteName(e.target.value); setSavedAt(null); }}
            aria-label="Quote name"
          />
        </div>
        <div className="qe-top-actions">
          <div className="qe-viewtoggle" role="group" aria-label="View">
            <button className="is-active" aria-pressed="true">Business</button>
            <button onClick={() => setMode("customer")} aria-pressed="false">Customer</button>
          </div>
          <button className="qe-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : savedAt ? "Saved ✓" : quoteId ? "Update" : "Save"}
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
            <h3>Status</h3>
            <StatusPicker status={status} onChange={handleStatusChange} />
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
          {saving ? "Saving…" : savedAt ? "Saved ✓" : quoteId ? "Update" : "Save"}
        </button>
      </div>

      {editing && (
        <LineEditorSheet
          line={editing}
          index={editingIndex + 1}
          result={results[editingIndex]}
          onChange={(patch) => updateLine(editing.id, patch)}
          onDelete={() => { deleteLine(editing.id); setEditingId(null); }}
          onClose={() => setEditingId(null)}
        />
      )}

      {showImageReader && (
        <ImageReaderPanel onAdd={handleAddFromImage} onClose={() => setShowImageReader(false)} />
      )}
      {showVoiceReader && (
        <VoiceReaderPanel onAdd={handleAddFromVoice} onClose={() => setShowVoiceReader(false)} />
      )}
    </div>
  );
}

// ---- Collapsed row ----

function LineRow({
  index, line: l, result: r, selected,
  confirmingDelete, onToggleSelect, onEdit,
  onAskDelete, onCancelDelete, onConfirmDelete,
}: {
  index: number; line: UILine; result: LineResult; selected: boolean;
  confirmingDelete: boolean;
  onToggleSelect: () => void; onEdit: () => void;
  onAskDelete: () => void; onCancelDelete: () => void; onConfirmDelete: () => void;
}) {
  const qty = parseInt(l.qty) || 0;
  const disc = l.sellMode === "discount" ? discountLabel(l.sellDisc1, l.sellDisc2) : "";
  const noRate = l.sellMode === "direct" && l.sellRate.trim() === "";
  const unnamed = l.name.trim() === "";

  return (
    <div className={"qe-row" + (selected ? " is-selected" : "")}>
      <button
        className={"qe-row-num" + (selected ? " is-selected" : "")}
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={`Select item ${index}`}
        title="Select for blanket discount"
      >
        {selected ? "✓" : index}
      </button>

      <button className="qe-row-main" onClick={onEdit}>
        <span className="qe-row-name">
          {unnamed ? <em>Unnamed item</em> : l.name}
        </span>
        <span className="qe-row-meta">
          <span className="tnum">
            {qty} × {formatINR(r.resolvedSell, 2)}
          </span>
          {disc && <span className="qe-chip">{disc}</span>}
          {noRate && <span className="qe-chip qe-chip-warn">no rate</span>}
          <span className={"qe-row-profit " + (r.lineProfit >= 0 ? "is-profit" : "is-loss")}>
            {r.lineProfit >= 0 ? "+" : ""}
            {formatINR(r.lineProfit)}
          </span>
        </span>
      </button>

      <span className="qe-row-amount tnum">{formatINR(r.lineSaleTotal)}</span>

      {confirmingDelete ? (
        <span className="qe-row-confirm">
          <button className="qe-del-yes" onClick={onConfirmDelete}>Delete</button>
          <button className="qe-del-no" onClick={onCancelDelete}>Cancel</button>
        </span>
      ) : (
        <span className="qe-row-tools">
          <button className="qe-icon-btn" onClick={onEdit} aria-label={`Edit item ${index}`}>
            <PencilIcon />
          </button>
          <button
            className="qe-icon-btn qe-icon-danger"
            onClick={onAskDelete}
            aria-label={`Delete item ${index}`}
          >
            <TrashIcon />
          </button>
        </span>
      )}
    </div>
  );
}

// ---- Line editor bottom sheet ----

function LineEditorSheet({
  line: l, index, result: r, onChange, onDelete, onClose,
}: {
  line: UILine; index: number; result: LineResult;
  onChange: (patch: Partial<UILine>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="qe-sheet-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="qe-sheet" role="dialog" aria-label={`Edit item ${index}`}>
        <div className="qe-sheet-head">
          <span className="qe-sheet-title">Item {index}</span>
          <button className="qe-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="qe-sheet-body">
          <label className="qe-field">
            <span>Item name</span>
            <input
              className="qe-input"
              value={l.name}
              placeholder="size / item"
              autoFocus
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>

          <label className="qe-field qe-field-third">
            <span>Qty</span>
            <input
              className="qe-input num"
              value={l.qty}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => onChange({ qty: e.target.value })}
            />
          </label>

          <PriceSide
            kind="cost"
            label="Cost — what you pay"
            mode={l.costMode} list={l.costList} disc1={l.costDisc1} disc2={l.costDisc2} rate={l.costRate}
            resolved={r.resolvedCost} total={r.lineCostTotal}
            onChange={(p) => onChange({
              costMode: p.mode ?? l.costMode, costList: p.list ?? l.costList,
              costDisc1: p.disc1 ?? l.costDisc1, costDisc2: p.disc2 ?? l.costDisc2, costRate: p.rate ?? l.costRate,
              ...(p.list !== undefined ? { sellList: p.list } : {}),
            })}
          />

          <PriceSide
            kind="sell"
            label="Sell — what the customer pays"
            mode={l.sellMode} list={l.sellList} disc1={l.sellDisc1} disc2={l.sellDisc2} rate={l.sellRate}
            resolved={r.resolvedSell} total={r.lineSaleTotal}
            onChange={(p) => onChange({
              sellMode: p.mode ?? l.sellMode, sellList: p.list ?? l.sellList,
              sellDisc1: p.disc1 ?? l.sellDisc1, sellDisc2: p.disc2 ?? l.sellDisc2, sellRate: p.rate ?? l.sellRate,
              ...(p.list !== undefined ? { costList: p.list } : {}),
            })}
          />

          <div className="qe-sheet-foot-stats">
            <label className="qe-field qe-field-third">
              <span>GST %</span>
              <input
                className="qe-input num"
                value={l.gstPct}
                inputMode="numeric"
                onChange={(e) => onChange({ gstPct: e.target.value })}
              />
            </label>
            <div className="qe-stat">
              <span>GST</span>
              <strong className="tnum">{formatINR(r.gstAmount)}</strong>
            </div>
            <div className={"qe-stat " + (r.lineProfit >= 0 ? "is-profit" : "is-loss")}>
              <span>Profit</span>
              <strong className="tnum">{formatINR(r.lineProfit)}</strong>
            </div>
            <div className="qe-stat">
              <span>Line total</span>
              <strong className="tnum">{formatINR(r.lineCustomerTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="qe-sheet-actions">
          {confirmDelete ? (
            <>
              <span className="qe-sheet-confirm">Delete this item?</span>
              <button className="qe-del-yes" onClick={onDelete}>Delete</button>
              <button className="qe-del-no" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="qe-btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete item
              </button>
              <button className="qe-btn-primary" onClick={onClose}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Price side ----

interface SidePatch { mode?: "discount" | "direct"; list?: string; disc1?: string; disc2?: string; rate?: string; }

function PriceSide({ kind, label, mode, list, disc1, disc2, rate, resolved, total, onChange }: {
  kind: "cost" | "sell"; label: string; mode: "discount" | "direct";
  list: string; disc1: string; disc2: string; rate: string;
  resolved: number; total: number; onChange: (p: SidePatch) => void;
}) {
  const emptyRate = mode === "direct" && rate.trim() === "";
  return (
    <div className={"qe-side qe-side-" + kind}>
      <div className="qe-side-top">
        <span className="qe-side-label">{label}</span>
        <div className="qe-seg qe-seg-sm" role="group" aria-label={`${kind} pricing mode`}>
          <button
            className={mode === "discount" ? "is-active" : ""}
            aria-pressed={mode === "discount"}
            onClick={() => onChange({ mode: "discount" })}
          >
            Discount
          </button>
          <button
            className={mode === "direct" ? "is-active" : ""}
            aria-pressed={mode === "direct"}
            onClick={() => onChange({ mode: "direct" })}
          >
            Rate
          </button>
        </div>
      </div>

      {mode === "discount" ? (
        <div className="qe-side-inputs">
          <label className="qe-field">
            <span>List price</span>
            <input className="qe-input num" value={list} placeholder="0" inputMode="numeric"
              onChange={(e) => onChange({ list: e.target.value })} />
          </label>
          <label className="qe-field">
            <span>Discount %</span>
            <input className="qe-input num" value={disc1} placeholder="e.g. 64.7" inputMode="decimal"
              onChange={(e) => onChange({ disc1: e.target.value })} />
          </label>
          <label className="qe-field">
            <span>Extra disc %</span>
            <input className="qe-input num" value={disc2} placeholder="e.g. 2" inputMode="decimal"
              onChange={(e) => onChange({ disc2: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="qe-side-inputs">
          {kind === "sell" && (
            <label className="qe-field">
              <span>List price (optional)</span>
              <input className="qe-input num" value={list} placeholder="for discount %" inputMode="numeric"
                onChange={(e) => onChange({ list: e.target.value })} />
            </label>
          )}
          <label className="qe-field">
            <span>Rate / unit</span>
            <input
              className={"qe-input num" + (emptyRate ? " is-warn" : "")}
              value={rate} placeholder="enter rate" inputMode="numeric"
              onChange={(e) => onChange({ rate: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="qe-side-resolved">
        {emptyRate ? (
          <span className="qe-warn-text">⚠ no rate entered — counts as ₹0</span>
        ) : (
          <>
            <span>{formatINR(resolved, 2)} <em>/ unit</em></span>
            <span className="tnum">= {formatINR(total)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, tone, strong }: {
  label: string; value: string; tone?: "cost" | "sell" | "gst"; strong?: boolean;
}) {
  return (
    <div className={"qe-summary-row" + (strong ? " is-strong" : "")}>
      <dt className={tone ? `is-${tone}` : ""}>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

// ---- Icons ----

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4z" />
      <circle cx="12" cy="14" r="3.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0013 0M12 18.5V21" />
    </svg>
  );
}
