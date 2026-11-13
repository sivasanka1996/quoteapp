import { useMemo, useState } from "react";
import { type LineResult } from "../calc/engine";
import { formatINR } from "../format";
import { type UILine, type ItemDoc } from "../types";
import { findMatches } from "./matchCatalog";
import { discountLabel, costPatchFrom } from "./lineHelpers";

// Line-items editing components — shared by Quotations' QuoteEditor and
// Billing's InvoiceEditor. Both work on the same UILine[] shape with the
// same calc engine, cost/sell UI, and catalog matching; this file is that
// one screen used twice, not a hypothetical abstraction. The pure
// (non-component) helpers these build on live in lineHelpers.ts instead of
// here, split out for react-refresh/only-export-components — see
// docs/quotations.md and docs/billing.md for the full code map.

// ---- Collapsed row ----
// Reuses QuoteEditor.css's "qe-*" classes — already globally bundled
// (QuoteEditor.tsx is unconditionally imported by AppRouter.tsx), same
// pattern PricingScreen already relies on for its sheet styles.

export function LineRow({
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

export function LineEditorSheet({
  line: l, index, result: r, catalogItems, onChange, onDelete, onClose,
}: {
  line: UILine; index: number; result: LineResult; catalogItems: ItemDoc[];
  onChange: (patch: Partial<UILine>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = useMemo(() => findMatches(catalogItems, l.name), [catalogItems, l.name]);

  function pickCatalogItem(item: ItemDoc) {
    onChange({ name: item.name, ...costPatchFrom(item) });
    setShowSuggestions(false);
  }

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
          <label className="qe-field qe-field-autocomplete">
            <span>Item name</span>
            <input
              className="qe-input"
              value={l.name}
              placeholder="size / item"
              autoFocus
              onChange={(e) => { onChange({ name: e.target.value }); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setShowSuggestions(false)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="qe-suggest">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); pickCatalogItem(m); }}>
                      <span className="qe-suggest-name">{m.name}</span>
                      {m.brand && <span className="qe-suggest-brand">{m.brand}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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

export interface SidePatch { mode?: "discount" | "direct"; list?: string; disc1?: string; disc2?: string; rate?: string; }

export function PriceSide({ kind, label, mode, list, disc1, disc2, rate, resolved, total, onChange }: {
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

// ---- Generic summary row (cost/sell/GST/total dl rows) ----

export function Row({ label, value, tone, strong }: {
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

export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4z" />
      <circle cx="12" cy="14" r="3.2" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0013 0M12 18.5V21" />
    </svg>
  );
}
