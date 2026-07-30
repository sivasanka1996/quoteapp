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

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

interface ShareOpts {
  filename: string;
  title: string;
  text?: string;
}

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 24;

export async function shareQuotePdf(
  node: HTMLElement,
  { filename, title, text }: ShareOpts
): Promise<ShareOutcome> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });

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
    // Taller than one page — slice the canvas into page-sized bands
    const sliceH = Math.floor(usableH / scale);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const h = Math.min(sliceH, canvas.height - y);
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

  // Web Share Level 2 — Android Chrome. Desktop browsers mostly lack file share.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
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
