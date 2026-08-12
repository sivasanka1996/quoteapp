/**
 * Turns an on-screen element into an A4 PDF and hands it to the OS share
 * sheet, so Android offers WhatsApp directly.
 *
 * The PDF is a rendered image of the element rather than generated text. That
 * costs selectable text, but it is the only approach that reproduces Telugu
 * item names and the company logo exactly as they appear on screen — jsPDF's
 * built-in fonts cannot render Telugu script at all.
 *
 * Both libraries are imported dynamically: together they are ~400 KB, and the
 * app should not pay that on first load just to show the home screen.
 */

import { log } from "./log/logger";

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

interface ShareOpts {
  filename: string;
  title: string;
  text?: string;
}

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 24;

/**
 * Elements a page break may safely land after.
 *
 * Item rows first — they are the repeated content, so they are what a break
 * realistically lands on — plus the totals rows, so a break cannot separate
 * "Grand Total" from its figure.
 */
const BREAK_AFTER = ".cv-table tr, .cv-total-row";

/**
 * How tall each page of the rasterised document should be.
 *
 * Returns slice heights in canvas pixels, always summing to `totalHeight` so
 * nothing can be dropped between pages.
 *
 * `breakpoints` are offsets from the top of the canvas where a cut is tidy —
 * the bottom edge of each item row. The slicer takes the last one that still
 * fits on the page rather than filling the page to the millimetre, because a
 * break that lands mid-row cuts the text through the middle of the glyphs: the
 * item name on one page, the rest of that same row on the next. That was
 * measured on a real generated PDF (`scripts/pdf-check.ts`, 2026-08-12) before
 * this existed.
 *
 * With no breakpoints it fills each page exactly as it always did, so a
 * document with no table is unaffected.
 */
export function pageSlices(
  totalHeight: number,
  maxSliceHeight: number,
  breakpoints: number[] = []
): number[] {
  if (totalHeight <= 0) return [];
  // A non-positive page height has no sane answer and would loop forever.
  // One tall page beats a hung share button.
  if (maxSliceHeight <= 0) return [totalHeight];

  const slices: number[] = [];
  let y = 0;
  while (y < totalHeight) {
    const remaining = totalHeight - y;
    if (remaining <= maxSliceHeight) {
      slices.push(remaining);
      break;
    }
    const limit = y + maxSliceHeight;
    let cut = 0;
    for (const b of breakpoints) {
      if (b > y && b <= limit && b > cut) cut = b;
    }
    // No usable boundary means a single row taller than a page. Cut it.
    const h = cut > y ? cut - y : maxSliceHeight;
    slices.push(h);
    y += h;
  }
  return slices;
}

/**
 * The bottom edge of every breakable element, in CSS pixels from the top of the
 * captured node.
 *
 * Never throws: a document that cannot be measured still shares, it just falls
 * back to even bands.
 */
function breakOffsets(node: HTMLElement): number[] {
  try {
    const top = node.getBoundingClientRect().top;
    return Array.from(node.querySelectorAll(BREAK_AFTER)).map(
      (el) => el.getBoundingClientRect().bottom - top
    );
  } catch {
    return [];
  }
}

export async function shareQuotePdf(
  node: HTMLElement,
  { filename, title, text }: ShareOpts
): Promise<ShareOutcome> {
  const startedAt = Date.now();
  try {
    return await buildAndShare(node, { filename, title, text }, startedAt);
  } catch (e) {
    // I/O layer: log, re-throw. CustomerView already surfaces the failure to
    // Dad; this just leaves a record of which half broke. The generated PDF is
    // the one thing no automated check in this repo has ever inspected
    // (CLAUDE.md, PI-2), so a share that fails in the field is exactly the
    // event worth having a line for.
    log.error("pdf", "share failed", e, {
      filename,
      ms: Date.now() - startedAt,
    });
    throw e;
  }
}

async function buildAndShare(
  node: HTMLElement,
  { filename, title, text }: ShareOpts,
  startedAt: number
): Promise<ShareOutcome> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Measured before rasterising, while the element is still laid out.
  const cssBreaks = breakOffsets(node);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });

  // html2canvas renders at `scale`, but derive the ratio from what it actually
  // produced rather than assuming 2 — the offsets above are in CSS pixels and
  // the slicer works in canvas pixels.
  const pxRatio = node.offsetWidth > 0 ? canvas.width / node.offsetWidth : 1;
  const canvasBreaks = cssBreaks.map((b) => Math.round(b * pxRatio));

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const imgW = A4_W - MARGIN * 2;
  const usableH = A4_H - MARGIN * 2;
  // points per canvas pixel
  const scale = imgW / canvas.width;
  const fullH = canvas.height * scale;

  if (fullH <= usableH) {
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      MARGIN,
      MARGIN,
      imgW,
      fullH
    );
  } else {
    // Taller than one page — slice the canvas, preferring row boundaries
    const sliceH = Math.floor(usableH / scale);
    let y = 0;
    let page = 0;
    for (const h of pageSlices(canvas.height, sliceH, canvasBreaks)) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Could not prepare the PDF page.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

      if (page > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.95),
        "JPEG",
        MARGIN,
        MARGIN,
        imgW,
        h * scale
      );
      y += h;
      page++;
    }
  }

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  log.info("pdf", "pdf built", {
    filename,
    bytes: blob.size,
    canvasW: canvas.width,
    canvasH: canvas.height,
    ms: Date.now() - startedAt,
  });

  // Web Share Level 2 — Android Chrome. Desktop browsers mostly lack file share.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      log.info("pdf", "pdf shared", { filename });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        log.info("pdf", "share cancelled by the user", { filename });
        return "cancelled";
      }
      throw err;
    }
  }

  // Fallback: save the file so it can be attached by hand
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick so the click has taken effect
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log.info("pdf", "pdf downloaded (no share sheet on this device)", { filename });
  return "downloaded";
}

/** Safe filename: "Anjene Guntur - Rice & Pulses.pdf" -> "Anjene-Guntur-Rice-Pulses.pdf" */
export function pdfFilename(customer: string, quote: string): string {
  const slug = `${customer} ${quote}`
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${slug || "quotation"}.pdf`;
}
