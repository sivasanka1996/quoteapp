import { useMemo, useState } from "react";
import {
  calcQuote,
  type LineInput,
  type LineResult,
  type PriceMode,
} from "./calc/engine";
import { formatINR, formatPct } from "./format";
import { CustomerView, type CustomerLine } from "./CustomerView";
import { CompanySettingsPanel } from "./CompanySettings";
import { useCompanySettings } from "./useCompanySettings";
import "./App.css";

// --- Editable line shape ---
interface UILine {
  id: number;
  name: string;
  qty: string;
  costMode: "discount" | "direct";
  costList: string;
  costDisc1: string;
  costDisc2: string;
  costRate: string;
  sellMode: "discount" | "direct";
  sellList: string;
  sellDisc1: string;
  sellDisc2: string;
  sellRate: string;
  gstPct: string;
}

let nextId = 1;
function blankLine(): UILine {
  return {
    id: nextId++,
    name: "",
    qty: "",
    costMode: "discount",
    costList: "",
    costDisc1: "",
    costDisc2: "",
    costRate: "",
    sellMode: "direct",
    sellList: "",
    sellDisc1: "",
    sellDisc2: "",
    sellRate: "",
    gstPct: "18",
  };
}

function wireQuote(): UILine[] {
  const rows = [
    { name: "1.5 sq", qty: 402, list: 17835, rate: 6296 },
    { name: "2.5 sq", qty: 396, list: 29515, rate: 10451 },
    { name: "4 sq", qty: 208, list: 30345, rate: 10786 },
    { name: "10 sq", qty: 60, list: 73000, rate: 28043 },
  ];
  return rows.map((r) => ({
    id: nextId++,
    name: r.name,
    qty: String(r.qty),
    costMode: "discount" as const,
    costList: String(r.list),
    costDisc1: "64.7",
    costDisc2: "2",
    costRate: "",
    sellMode: "direct" as const,
    sellList: String(r.list),   // same MRP — used in customer PDF to show implied discount
    sellDisc1: "",
    sellDisc2: "",
    sellRate: String(r.rate),
    gstPct: "18",
  }));
}

function buildDiscountExpr(d1: string, d2: string): string {
  const v1 = parseFloat(d1);
  const v2 = parseFloat(d2);
  if (!v1 && !v2) return "0%";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}%`;
}

function toPriceMode(
  mode: "discount" | "direct",
  list: string,
  disc1: string,
  disc2: string,
  rate: string
): PriceMode {
  if (mode === "direct") {
    return { kind: "direct", rate: parseFloat(rate) || 0 };
  }
  return {
    kind: "discount",
    listPrice: parseFloat(list) || 0,
    discountExpr: buildDiscountExpr(disc1, disc2),
  };
}

function toLineInput(l: UILine): LineInput {
  return {
    name: l.name,
    qty: parseInt(l.qty) || 0,
    cost: toPriceMode(l.costMode, l.costList, l.costDisc1, l.costDisc2, l.costRate),
    sell: toPriceMode(l.sellMode, l.sellList, l.sellDisc1, l.sellDisc2, l.sellRate),
    gstPct: parseFloat(l.gstPct) || 0,
  };
}

// --- Blanket discount state ---
type BlanketSide = "cost" | "sell" | "both";
interface Blanket {
  side: BlanketSide;
  disc1: string;
  disc2: string;
}

function applyBlanket(_line: UILine, b: Blanket): Partial<UILine> {
  const patch: Partial<UILine> = {};
  if (b.side === "cost" || b.side === "both") {
    patch.costMode = "discount";
    patch.costDisc1 = b.disc1;
    patch.costDisc2 = b.disc2;
  }
  if (b.side === "sell" || b.side === "both") {
    patch.sellMode = "discount";
    patch.sellDisc1 = b.disc1;
    patch.sellDisc2 = b.disc2;
  }
  return patch;
}

// -----------------------------------------------------------------------

function App() {
  const [lines, setLines] = useState<UILine[]>(wireQuote);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [blanket, setBlanket] = useState<Blanket>({ side: "cost", disc1: "", disc2: "" });
  const [showCustomer, setShowCustomer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { settings: company, update: updateCompany } = useCompanySettings();

  const { results, totals } = useMemo(() => {
    const { lines: results, totals } = calcQuote(lines.map(toLineInput));
    return { results, totals };
  }, [lines]);

  function update(id: number, patch: Partial<UILine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function deleteLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }
  function toggleSelect(id: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  function toggleSelectAll() {
    if (selected.size === lines.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lines.map((l) => l.id)));
    }
  }

  function applyBlanketToAll() {
    setLines((prev) => prev.map((l) => ({ ...l, ...applyBlanket(l, blanket) })));
  }
  function applyBlanketToSelected() {
    setLines((prev) =>
      prev.map((l) => selected.has(l.id) ? { ...l, ...applyBlanket(l, blanket) } : l)
    );
  }

  const allSelected = lines.length > 0 && selected.size === lines.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Build customer-view line data
  const customerLines: CustomerLine[] = lines.map((l, i) => {
    const listPrice = parseFloat(l.sellList) || null;
    let sellDisc1 = "";
    let sellDisc2 = "";
    if (l.sellMode === "discount") {
      sellDisc1 = l.sellDisc1;
      sellDisc2 = l.sellDisc2;
    } else if (listPrice && results[i].resolvedSell > 0) {
      // Back-calculate the implied discount % from list price and direct rate
      const impliedDisc = (1 - results[i].resolvedSell / listPrice) * 100;
      sellDisc1 = impliedDisc > 0 ? impliedDisc.toFixed(2) : "";
    }
    return {
      name: l.name,
      qty: parseInt(l.qty) || 0,
      listPrice,
      sellDisc1,
      sellDisc2,
      result: results[i],
    };
  });

  if (showCustomer) {
    return (
      <CustomerView
        lines={customerLines}
        totals={totals}
        company={company}
        onClose={() => setShowCustomer(false)}
      />
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Quotation</h1>
        <div className="header-right">
          <span className="view-tag">His View</span>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>
            ⚙ Company
          </button>
          <button className="btn-customer-view" onClick={() => setShowCustomer(true)}>
            Customer View →
          </button>
        </div>
      </header>

      {/* Blanket discount panel */}
      <div className="blanket-panel">
        <div className="blanket-title">Blanket Discount</div>
        <div className="blanket-body">
          {/* Side selector */}
          <div className="mode-toggle">
            {(["cost", "sell", "both"] as BlanketSide[]).map((s) => (
              <button
                key={s}
                className={blanket.side === s ? "active" : ""}
                onClick={() => setBlanket((b) => ({ ...b, side: s }))}
              >
                {s === "cost" ? "Cost" : s === "sell" ? "Sell" : "Both"}
              </button>
            ))}
          </div>

          <label className="blanket-field">
            <span>Discount %</span>
            <input
              className="num"
              value={blanket.disc1}
              placeholder="e.g. 64.7"
              inputMode="decimal"
              onChange={(e) => setBlanket((b) => ({ ...b, disc1: e.target.value }))}
            />
          </label>

          <label className="blanket-field">
            <span>Extra disc %</span>
            <input
              className="num"
              value={blanket.disc2}
              placeholder="e.g. 2"
              inputMode="decimal"
              onChange={(e) => setBlanket((b) => ({ ...b, disc2: e.target.value }))}
            />
          </label>

          <div className="blanket-actions">
            <button className="btn-apply-all" onClick={applyBlanketToAll}>
              Apply to all
            </button>
            <button
              className="btn-apply-sel"
              disabled={selected.size === 0}
              onClick={applyBlanketToSelected}
            >
              Apply to selected {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>

        {/* Select all row */}
        <label className="select-all-row">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={toggleSelectAll}
          />
          <span>{allSelected ? "Deselect all" : "Select all"}</span>
        </label>
      </div>

      <div className="cards">
        {lines.map((l, i) => (
          <LineCard
            key={l.id}
            line={l}
            result={results[i]}
            checked={selected.has(l.id)}
            onToggleSelect={() => toggleSelect(l.id)}
            onChange={(patch) => update(l.id, patch)}
            onDelete={() => deleteLine(l.id)}
          />
        ))}
      </div>

      <button className="add-btn" onClick={addLine}>
        + Add item
      </button>

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

      <div className="footer-actions">
        <button onClick={() => setLines(wireQuote())}>Reset to wire quote</button>
        <button onClick={() => { setLines([blankLine()]); setSelected(new Set()); }}>Clear all</button>
      </div>

      {showSettings && (
        <CompanySettingsPanel
          settings={company}
          onChange={updateCompany}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// --- One line item as a card ---
function LineCard({
  line: l,
  result: r,
  checked,
  onToggleSelect,
  onChange,
  onDelete,
}: {
  line: UILine;
  result: LineResult;
  checked: boolean;
  onToggleSelect: () => void;
  onChange: (patch: Partial<UILine>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={"card" + (checked ? " card-selected" : "")}>
      <div className="card-head">
        <input
          type="checkbox"
          className="card-check"
          checked={checked}
          onChange={onToggleSelect}
        />
        <input
          className="name-input"
          value={l.name}
          placeholder="size / item"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <label className="qty-field">
          <span>Qty</span>
          <input
            className="qty-input num"
            value={l.qty}
            inputMode="numeric"
            onChange={(e) => onChange({ qty: e.target.value })}
          />
        </label>
        <button className="del" onClick={onDelete} aria-label="Delete line">
          ✕
        </button>
      </div>

      <PriceSide
        kind="cost"
        label="Cost (buy)"
        mode={l.costMode}
        list={l.costList}
        disc1={l.costDisc1}
        disc2={l.costDisc2}
        rate={l.costRate}
        resolved={r.resolvedCost}
        total={r.lineCostTotal}
        onChange={(patch) =>
          onChange({
            costMode: patch.mode ?? l.costMode,
            costList: patch.list ?? l.costList,
            costDisc1: patch.disc1 ?? l.costDisc1,
            costDisc2: patch.disc2 ?? l.costDisc2,
            costRate: patch.rate ?? l.costRate,
          })
        }
      />

      <PriceSide
        kind="sell"
        label="Sell (customer)"
        mode={l.sellMode}
        list={l.sellList}
        disc1={l.sellDisc1}
        disc2={l.sellDisc2}
        rate={l.sellRate}
        resolved={r.resolvedSell}
        total={r.lineSaleTotal}
        onChange={(patch) =>
          onChange({
            sellMode: patch.mode ?? l.sellMode,
            sellList: patch.list ?? l.sellList,
            sellDisc1: patch.disc1 ?? l.sellDisc1,
            sellDisc2: patch.disc2 ?? l.sellDisc2,
            sellRate: patch.rate ?? l.sellRate,
          })
        }
      />

      <div className="card-foot">
        <div className={"foot-stat " + (r.lineProfit >= 0 ? "profit" : "loss")}>
          <span>Profit</span>
          <strong>{formatINR(r.lineProfit)}</strong>
        </div>
        <label className="gst-field">
          <span>GST %</span>
          <input
            className="gst-input num"
            value={l.gstPct}
            inputMode="numeric"
            onChange={(e) => onChange({ gstPct: e.target.value })}
          />
        </label>
        <div className="foot-stat">
          <span>GST</span>
          <strong>{formatINR(r.gstAmount)}</strong>
        </div>
        <div className="foot-stat">
          <span>Line total</span>
          <strong>{formatINR(r.lineCustomerTotal)}</strong>
        </div>
      </div>
    </div>
  );
}

interface SidePatch {
  mode?: "discount" | "direct";
  list?: string;
  disc1?: string;
  disc2?: string;
  rate?: string;
}

function PriceSide({
  kind,
  label,
  mode,
  list,
  disc1,
  disc2,
  rate,
  resolved,
  total,
  onChange,
}: {
  kind: "cost" | "sell";
  label: string;
  mode: "discount" | "direct";
  list: string;
  disc1: string;
  disc2: string;
  rate: string;
  resolved: number;
  total: number;
  onChange: (patch: SidePatch) => void;
}) {
  const emptyRate = mode === "direct" && rate.trim() === "";
  return (
    <div className={"side side-" + kind}>
      <div className="side-top">
        <span className="side-label">{label}</span>
        <div className="mode-toggle">
          <button
            className={mode === "discount" ? "active" : ""}
            onClick={() => onChange({ mode: "discount" })}
          >
            Discount
          </button>
          <button
            className={mode === "direct" ? "active" : ""}
            onClick={() => onChange({ mode: "direct" })}
          >
            Rate
          </button>
        </div>
      </div>

      {mode === "discount" ? (
        <div className="side-inputs">
          <label>
            <span>List price</span>
            <input
              className="num"
              value={list}
              placeholder="0"
              inputMode="numeric"
              onChange={(e) => onChange({ list: e.target.value })}
            />
          </label>
          <label>
            <span>Discount %</span>
            <input
              className="num"
              value={disc1}
              placeholder="e.g. 64.7"
              inputMode="decimal"
              onChange={(e) => onChange({ disc1: e.target.value })}
            />
          </label>
          <label>
            <span>Extra disc %</span>
            <input
              className="num"
              value={disc2}
              placeholder="e.g. 2"
              inputMode="decimal"
              onChange={(e) => onChange({ disc2: e.target.value })}
            />
          </label>
        </div>
      ) : (
        <div className="side-inputs">
          {kind === "sell" && (
            <label>
              <span>List price (optional)</span>
              <input
                className="num"
                value={list}
                placeholder="for discount %"
                inputMode="numeric"
                onChange={(e) => onChange({ list: e.target.value })}
              />
            </label>
          )}
          <label className="full">
            <span>Rate / unit</span>
            <input
              className={"num" + (emptyRate ? " warn" : "")}
              value={rate}
              placeholder="enter rate"
              inputMode="numeric"
              onChange={(e) => onChange({ rate: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="side-resolved">
        {emptyRate ? (
          <span className="warn-text">⚠ no rate entered — counts as ₹0</span>
        ) : (
          <>
            <span className="resolved-unit">
              {formatINR(resolved, 2)} <em>/ unit</em>
            </span>
            <span className="resolved-total">= {formatINR(total)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  big,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  big?: boolean;
}) {
  return (
    <div className={"stat" + (highlight ? " highlight" : "") + (big ? " big" : "")}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export default App;
