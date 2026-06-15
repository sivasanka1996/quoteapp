import { useState } from "react";
import { type LineResult } from "./calc/engine";
import { type CompanySettings } from "./useCompanySettings";
import { formatINR } from "./format";
import "./CustomerView.css";

export interface CustomerLine {
  name: string;
  qty: number;
  listPrice: number | null;
  sellDisc1: string;
  sellDisc2: string;
  result: LineResult;
}

export interface CustomerViewProps {
  lines: CustomerLine[];
  totals: {
    totalSale: number;
    totalGst: number;
    grandTotal: number;
  };
  company: CompanySettings;
  onClose: () => void;
}

type ColKey = "qty" | "listPrice" | "discount" | "rate" | "amount";

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: "qty",       label: "Qty" },
  { key: "listPrice", label: "List price" },
  { key: "discount",  label: "Discount" },
  { key: "rate",      label: "Rate / unit" },
  { key: "amount",    label: "Amount" },
];

function discountLabel(d1: string, d2: string): string {
  const v1 = parseFloat(d1);
  const v2 = parseFloat(d2);
  if (!v1 && !v2) return "";
  if (v1 && v2) return `${v1}% + ${v2}%`;
  return `${v1 || v2}%`;
}

export function CustomerView({ lines, totals, company, onClose }: CustomerViewProps) {
  const [visible, setVisible] = useState<Set<ColKey>>(
    new Set(["qty", "listPrice", "discount", "rate", "amount"])
  );

  function toggleCol(key: ColKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const show = (key: ColKey) => visible.has(key);
  const hasCompany = !!(company.name || company.addressLine1 || company.phone || company.gstin || company.logoDataUrl);

  return (
    <div className="cv-overlay">
      <div className="cv-sheet">
        {/* Screen-only controls */}
        <div className="cv-toolbar no-print">
          <button className="cv-close" onClick={onClose}>← Back</button>
          <button className="cv-print" onClick={() => window.print()}>
            🖨 Print / Save PDF
          </button>
        </div>

        {/* Column toggles — screen only */}
        <div className="cv-col-toggles no-print">
          <span className="cv-toggle-label">Show columns:</span>
          {ALL_COLS.map((col) => (
            <button
              key={col.key}
              className={"cv-col-btn" + (show(col.key) ? " active" : "")}
              onClick={() => toggleCol(col.key)}
            >
              {col.label}
            </button>
          ))}
        </div>

        {/* Printable document */}
        <div className="cv-doc">

          {/* Company header */}
          {hasCompany && (
            <div className="cv-company-header">
              {company.logoDataUrl && (
                <img className="cv-company-logo" src={company.logoDataUrl} alt="logo" />
              )}
              <div className="cv-company-info">
                {company.name        && <div className="cv-company-name">{company.name}</div>}
                {company.addressLine1 && <div className="cv-company-addr">{company.addressLine1}</div>}
                {company.addressLine2 && <div className="cv-company-addr">{company.addressLine2}</div>}
                <div className="cv-company-meta">
                  {company.phone && <span>📞 {company.phone}</span>}
                  {company.gstin && <span>GSTIN: {company.gstin}</span>}
                </div>
              </div>
            </div>
          )}

          <div className="cv-divider" />

          <h1 className="cv-title">Quotation</h1>

          <table className="cv-table">
            <thead>
              <tr>
                <th>Item</th>
                {show("qty")       && <th className="num">Qty</th>}
                {show("listPrice") && <th className="num">List price</th>}
                {show("discount")  && <th className="num">Discount</th>}
                {show("rate")      && <th className="num">Rate / unit</th>}
                {show("amount")    && <th className="num">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const disc = discountLabel(l.sellDisc1, l.sellDisc2);
                return (
                  <tr key={i}>
                    <td>{l.name}</td>
                    {show("qty")       && <td className="num">{l.qty}</td>}
                    {show("listPrice") && <td className="num">{l.listPrice ? formatINR(l.listPrice) : "—"}</td>}
                    {show("discount")  && <td className="num">{disc || "—"}</td>}
                    {show("rate")      && <td className="num">{formatINR(l.result.resolvedSell, 2)}</td>}
                    {show("amount")    && <td className="num">{formatINR(l.result.lineSaleTotal)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="cv-totals">
            <div className="cv-total-row">
              <span>Subtotal</span>
              <strong>{formatINR(totals.totalSale)}</strong>
            </div>
            <div className="cv-total-row">
              <span>GST</span>
              <strong>{formatINR(totals.totalGst)}</strong>
            </div>
            <div className="cv-total-row cv-grand">
              <span>Grand Total</span>
              <strong>{formatINR(totals.grandTotal)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
