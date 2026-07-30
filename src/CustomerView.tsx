import { useEffect, useRef, useState } from "react";
import { type LineResult } from "./calc/engine";
import { type CompanySettings } from "./useCompanySettings";
import { formatINR } from "./format";
import { shareQuotePdf, pdfFilename } from "./sharePdf";
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
  customerName?: string;
  quoteName?: string;
  /** Start the share sheet as soon as the document is on screen. */
  autoShare?: boolean;
  onShareHandled?: () => void;
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

export function CustomerView({
  lines, totals, company, onClose,
  customerName = "", quoteName = "", autoShare = false, onShareHandled,
}: CustomerViewProps) {
  const [visible, setVisible] = useState<Set<ColKey>>(
    new Set(["qty", "listPrice", "discount", "rate", "amount"])
  );
  const docRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  function toggleCol(key: ColKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleShare() {
    if (!docRef.current || sharing) return;
    setSharing(true);
    setShareMsg("");
    try {
      const outcome = await shareQuotePdf(docRef.current, {
        filename: pdfFilename(customerName, quoteName),
        title: quoteName || "Quotation",
        text: company.name ? `Quotation from ${company.name}` : undefined,
      });
      if (outcome === "downloaded") {
        setShareMsg("PDF saved to your downloads — attach it in WhatsApp.");
      }
    } catch {
      setShareMsg("Could not build the PDF. Use Print / Save PDF instead.");
    } finally {
      setSharing(false);
    }
  }

  // Fire the share sheet once the document has painted, when asked to
  useEffect(() => {
    if (!autoShare) return;
    onShareHandled?.();
    const t = setTimeout(handleShare, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShare]);

  const show = (key: ColKey) => visible.has(key);
  const hasCompany = !!(company.name || company.addressLine1 || company.phone || company.gstin || company.logoDataUrl);

  return (
    <div className="cv-overlay">
      <div className="cv-sheet">
        {/* Screen-only controls */}
        <div className="cv-toolbar no-print">
          <button className="cv-close" onClick={onClose}>← Back</button>
          <div className="cv-toolbar-right">
            <button className="cv-print" onClick={() => window.print()}>
              🖨 Print / Save PDF
            </button>
            <button className="cv-share" onClick={handleShare} disabled={sharing}>
              {sharing ? "Preparing…" : "Share PDF / WhatsApp"}
            </button>
          </div>
        </div>

        {shareMsg && <p className="cv-share-msg no-print">{shareMsg}</p>}

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
        <div className="cv-doc" ref={docRef}>

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
