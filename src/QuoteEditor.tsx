import { useMemo, useState } from "react";
import { calcQuote, type LineInput, type LineResult, type PriceMode } from "./calc/engine";
import { formatINR, formatPct } from "./format";
import { CustomerView, type CustomerLine } from "./CustomerView";
import { CompanySettingsPanel } from "./CompanySettings";
import { useCompanySettings } from "./useCompanySettings";
import { useQuotes } from "./useQuotes";
import { type UILine, type Customer, type QuoteDoc } from "./types";
import { ImageReaderPanel } from "./ImageReader";
import { type ReadItem } from "./readImage";
import { VoiceReaderPanel, type VoiceItem } from "./VoiceReader";
import "./App.css";

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
  initialItems?: import("./readImage").ReadItem[];
  onBack: () => void;
}

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
  const [showCustomerView, setShowCustomerView] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [quoteName, setQuoteName] = useState(existingQuote?.name ?? "");
  const [quoteId, setQuoteId] = useState<string | undefined>(existingQuote?.id);
  const [saving, setSaving] = useState(false);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showVoiceReader, setShowVoiceReader] = useState(false);

  const { settings: company, update: updateCompany } = useCompanySettings();
  const { saveQuote } = useQuotes(customer.id);

  const { results, totals } = useMemo(() => {
    const { lines: results, totals } = calcQuote(lines.map(toLineInput));
    return { results, totals };
  }, [lines]);

  function updateLine(id: number, patch: Partial<UILine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, blankLine()]); }
  function deleteLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }
  function toggleSelect(id: number) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleSelectAll() {
    setSelected(selected.size === lines.length ? new Set() : new Set(lines.map((l) => l.id)));
  }
  function applyBlanketToAll() {
    setLines((prev) => prev.map((l) => ({ ...l, ...applyBlanket(l, blanket) })));
  }
  function applyBlanketToSelected() {
    setLines((prev) => prev.map((l) => selected.has(l.id) ? { ...l, ...applyBlanket(l, blanket) } : l));
  }

  function handleAddFromVoice(voiceItem: VoiceItem) {
    setLines((prev) => [...prev, {
      ...blankLine(),
      name: voiceItem.name,
      qty: String(voiceItem.qty || 1),
      sellMode: "direct" as const,
      sellRate: voiceItem.rate != null ? String(voiceItem.rate) : "",
    }]);
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
  }

  async function handleSave() {

    setSaving(true);
    const id = await saveQuote(customer.name, quoteName || "Untitled", lines, totals.totalSale, quoteId);
    setQuoteId(id);
    setSaving(false);
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

  if (showCustomerView) {
    return <CustomerView lines={customerLines} totals={totals} company={company} onClose={() => setShowCustomerView(false)} />;
  }

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <button className="qe-back" onClick={onBack}>←</button>
          <div>
            <div className="qe-customer">{customer.name}</div>
            <input
              className="qe-quote-name"
              value={quoteName}
              placeholder="Quote name / label"
              onChange={(e) => setQuoteName(e.target.value)}
            />
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn-save-quote"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : quoteId ? "Update" : "Save"}
          </button>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>⚙ Company</button>
          <button className="btn-customer-view" onClick={() => setShowCustomerView(true)}>Customer View →</button>
        </div>
      </header>

      {/* Blanket discount panel */}
      <div className="blanket-panel">
        <div className="blanket-title">Blanket Discount</div>
        <div className="blanket-body">
          <div className="mode-toggle">
            {(["cost", "sell", "both"] as BlanketSide[]).map((s) => (
              <button key={s} className={blanket.side === s ? "active" : ""} onClick={() => setBlanket((b) => ({ ...b, side: s }))}>
                {s === "cost" ? "Cost" : s === "sell" ? "Sell" : "Both"}
              </button>
            ))}
          </div>
          <label className="blanket-field">
            <span>Discount %</span>
            <input className="num" value={blanket.disc1} placeholder="e.g. 64.7" inputMode="decimal" onChange={(e) => setBlanket((b) => ({ ...b, disc1: e.target.value }))} />
          </label>
          <label className="blanket-field">
            <span>Extra disc %</span>
            <input className="num" value={blanket.disc2} placeholder="e.g. 2" inputMode="decimal" onChange={(e) => setBlanket((b) => ({ ...b, disc2: e.target.value }))} />
          </label>
          <div className="blanket-actions">
            <button className="btn-apply-all" onClick={applyBlanketToAll}>Apply to all</button>
            <button className="btn-apply-sel" disabled={selected.size === 0} onClick={applyBlanketToSelected}>
              Apply to selected {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
        <label className="select-all-row">
          <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={toggleSelectAll} />
          <span>{allSelected ? "Deselect all" : "Select all"}</span>
        </label>
      </div>

      {lines.length === 0 ? (
        <div className="qe-empty">
          <button className="qe-empty-camera" onClick={() => setShowImageReader(true)}>
            📷
            <span>Read from image</span>
            <small>Take a photo of the order list</small>
          </button>
          <button className="qe-empty-camera qe-empty-voice" onClick={() => setShowVoiceReader(true)}>
            🎤
            <span>Add by voice</span>
            <small>Speak item name and quantity</small>
          </button>
          <button className="qe-empty-manual" onClick={addLine}>+ Add item manually</button>
        </div>
      ) : (
        <>
          <div className="cards">
            {lines.map((l, i) => (
              <LineCard key={l.id} line={l} result={results[i]} checked={selected.has(l.id)}
                onToggleSelect={() => toggleSelect(l.id)}
                onChange={(patch) => updateLine(l.id, patch)}
                onDelete={() => deleteLine(l.id)} />
            ))}
          </div>
          <div className="add-row">
            <button className="add-btn" onClick={addLine}>+ Add item</button>
            <button className="add-btn add-btn-image" onClick={() => setShowImageReader(true)}>📷 Image</button>
            <button className="add-btn add-btn-voice" onClick={() => setShowVoiceReader(true)}>🎤 Voice</button>
          </div>
        </>
      )}

      <section className="summary">
        <h2>Profit Summary</h2>
        <div className="summary-grid">
          <Stat label="Total cost" value={formatINR(totals.totalCost)} />
          <Stat label="Total sale (pre-GST)" value={formatINR(totals.totalSale)} />
          <Stat label="Gross profit" value={formatINR(totals.grossProfit)} highlight />
          <Stat label="Profit on cost" value={formatPct(totals.profitOnCostPct)} />
          <Stat label="Profit on sales" value={formatPct(totals.profitOnSalesPct)} />
          <Stat label="Total GST" value={formatINR(totals.totalGst)} />
          <Stat label="Grand total (with GST)" value={formatINR(totals.grandTotal)} big />
        </div>
      </section>

      {showSettings && <CompanySettingsPanel settings={company} onChange={updateCompany} onClose={() => setShowSettings(false)} />}
      {showImageReader && <ImageReaderPanel onAdd={handleAddFromImage} onClose={() => setShowImageReader(false)} />}
      {showVoiceReader && <VoiceReaderPanel onAdd={handleAddFromVoice} onClose={() => setShowVoiceReader(false)} />}
    </div>
  );
}

// ---- Sub-components (unchanged from App.tsx) ----

function LineCard({ line: l, result: r, checked, onToggleSelect, onChange, onDelete }: {
  line: UILine; result: LineResult; checked: boolean;
  onToggleSelect: () => void; onChange: (patch: Partial<UILine>) => void; onDelete: () => void;
}) {
  return (
    <div className={"card" + (checked ? " card-selected" : "")}>
      <div className="card-head">
        <input type="checkbox" className="card-check" checked={checked} onChange={onToggleSelect} />
        <input className="name-input" value={l.name} placeholder="size / item" onChange={(e) => onChange({ name: e.target.value })} />
        <label className="qty-field">
          <span>Qty</span>
          <input className="qty-input num" value={l.qty} inputMode="numeric" onChange={(e) => onChange({ qty: e.target.value })} />
        </label>
        <button className="del" onClick={onDelete} aria-label="Delete line">✕</button>
      </div>
      <PriceSide kind="cost" label="Cost (buy)" mode={l.costMode} list={l.costList} disc1={l.costDisc1} disc2={l.costDisc2} rate={l.costRate}
        resolved={r.resolvedCost} total={r.lineCostTotal}
        onChange={(p) => onChange({
          costMode: p.mode ?? l.costMode, costList: p.list ?? l.costList,
          costDisc1: p.disc1 ?? l.costDisc1, costDisc2: p.disc2 ?? l.costDisc2, costRate: p.rate ?? l.costRate,
          ...(p.list !== undefined ? { sellList: p.list } : {}),
        })} />
      <PriceSide kind="sell" label="Sell (customer)" mode={l.sellMode} list={l.sellList} disc1={l.sellDisc1} disc2={l.sellDisc2} rate={l.sellRate}
        resolved={r.resolvedSell} total={r.lineSaleTotal}
        onChange={(p) => onChange({
          sellMode: p.mode ?? l.sellMode, sellList: p.list ?? l.sellList,
          sellDisc1: p.disc1 ?? l.sellDisc1, sellDisc2: p.disc2 ?? l.sellDisc2, sellRate: p.rate ?? l.sellRate,
          ...(p.list !== undefined ? { costList: p.list } : {}),
        })} />
      <div className="card-foot">
        <div className={"foot-stat " + (r.lineProfit >= 0 ? "profit" : "loss")}>
          <span>Profit</span><strong>{formatINR(r.lineProfit)}</strong>
        </div>
        <label className="gst-field">
          <span>GST %</span>
          <input className="gst-input num" value={l.gstPct} inputMode="numeric" onChange={(e) => onChange({ gstPct: e.target.value })} />
        </label>
        <div className="foot-stat"><span>GST</span><strong>{formatINR(r.gstAmount)}</strong></div>
        <div className="foot-stat"><span>Line total</span><strong>{formatINR(r.lineCustomerTotal)}</strong></div>
      </div>
    </div>
  );
}

interface SidePatch { mode?: "discount" | "direct"; list?: string; disc1?: string; disc2?: string; rate?: string; }

function PriceSide({ kind, label, mode, list, disc1, disc2, rate, resolved, total, onChange }: {
  kind: "cost" | "sell"; label: string; mode: "discount" | "direct";
  list: string; disc1: string; disc2: string; rate: string;
  resolved: number; total: number; onChange: (p: SidePatch) => void;
}) {
  const emptyRate = mode === "direct" && rate.trim() === "";
  return (
    <div className={"side side-" + kind}>
      <div className="side-top">
        <span className="side-label">{label}</span>
        <div className="mode-toggle">
          <button className={mode === "discount" ? "active" : ""} onClick={() => onChange({ mode: "discount" })}>Discount</button>
          <button className={mode === "direct" ? "active" : ""} onClick={() => onChange({ mode: "direct" })}>Rate</button>
        </div>
      </div>
      {mode === "discount" ? (
        <div className="side-inputs">
          <label><span>List price</span><input className="num" value={list} placeholder="0" inputMode="numeric" onChange={(e) => onChange({ list: e.target.value })} /></label>
          <label><span>Discount %</span><input className="num" value={disc1} placeholder="e.g. 64.7" inputMode="decimal" onChange={(e) => onChange({ disc1: e.target.value })} /></label>
          <label><span>Extra disc %</span><input className="num" value={disc2} placeholder="e.g. 2" inputMode="decimal" onChange={(e) => onChange({ disc2: e.target.value })} /></label>
        </div>
      ) : (
        <div className="side-inputs">
          {kind === "sell" && (
            <label><span>List price (optional)</span><input className="num" value={list} placeholder="for discount %" inputMode="numeric" onChange={(e) => onChange({ list: e.target.value })} /></label>
          )}
          <label className="full"><span>Rate / unit</span>
            <input className={"num" + (emptyRate ? " warn" : "")} value={rate} placeholder="enter rate" inputMode="numeric" onChange={(e) => onChange({ rate: e.target.value })} />
          </label>
        </div>
      )}
      <div className="side-resolved">
        {emptyRate ? <span className="warn-text">⚠ no rate entered — counts as ₹0</span> : (
          <><span className="resolved-unit">{formatINR(resolved, 2)} <em>/ unit</em></span><span className="resolved-total">= {formatINR(total)}</span></>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, big }: { label: string; value: string; highlight?: boolean; big?: boolean; }) {
  return (
    <div className={"stat" + (highlight ? " highlight" : "") + (big ? " big" : "")}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
