/**
 * Live check — inspect the PDF the customer actually receives.
 *
 *   npm run build
 *   npm run preview                       # in another terminal, :4173
 *   npm install --no-save playwright-core # not a dependency; see below
 *   npx vite-node scripts/pdf-check.ts
 *
 * WHY THIS EXISTS. Every PI-2 check read the **DOM** that `sharePdf`
 * rasterises, never the file it produces. That is exactly how bug #8 hid: with
 * all five columns on, the Amount column was clipped out of the shared PDF
 * while the DOM looked perfect. A DOM assertion cannot speak for html2canvas.
 *
 * So this one drives the real app in a real browser at phone width, clicks the
 * real Share button, catches the real download, and then opens the file:
 * page count, page geometry, and the embedded JPEG extracted and written out as
 * an image so it can be looked at.
 *
 * `playwright-core` is installed with `--no-save` on purpose — it must not
 * become a dependency of a two-user app, and CI must not start downloading
 * browsers. It drives the Chrome already on the machine (`channel: "chrome"`),
 * so nothing is downloaded here either.
 *
 * THIS TOUCHES THE LIVE FIRESTORE PROJECT. It seeds one ZZ-pdf-check-* customer
 * and one quote, and deletes both in the finally block. Deliberately not a
 * *.test.ts, so `npm test` and CI never pick it up.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc } from "firebase/firestore";
import { chromium } from "playwright-core";
import type { UILine } from "../src/types";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "fixtures/pdf-check");
const BASE = "http://localhost:4173";
const TAG = `ZZ-pdf-check-${Date.now()}`;

const app = initializeApp({
  apiKey: "AIzaSyCAWvi1Ekiz_smS1INzxjf5Mjk9SToKoOA",
  authDomain: "quoteapp-3f48e.firebaseapp.com",
  projectId: "quoteapp-3f48e",
  storageBucket: "quoteapp-3f48e.firebasestorage.app",
  messagingSenderId: "166477443018",
  appId: "1:166477443018:web:10d7dc1534306a1c492933",
}, "pdf-check");
const db = getFirestore(app);

const results: Array<[string, boolean, string]> = [];
function check(label: string, pass: boolean, detail = "") {
  results.push([label, pass, detail]);
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Lines chosen to stress the Amount column, which is the one bug #8 clipped.
 *
 * A long item name pushes the table as wide as it will go, and a lakh-scale
 * amount makes the rightmost cell as wide as it will ever be — `formatMoney`
 * renders 12,34,567 with Indian grouping, which is wider than the same number
 * grouped the Western way. If Amount survives this, it survives Dad's quotes.
 */
const LINES: UILine[] = [
  {
    id: 1,
    name: "Finolex FR PVC copper wire 1.5 sq mm 90m coil",
    qty: "6", costMode: "discount", costList: "17835", costDisc1: "64.7",
    costDisc2: "2", costRate: "", sellMode: "discount", sellList: "17835",
    sellDisc1: "60", sellDisc2: "1.5", sellRate: "", gstPct: "18",
  },
  {
    id: 2,
    name: "MCB 32A DP C-curve",
    qty: "4", costMode: "direct", costList: "", costDisc1: "", costDisc2: "",
    costRate: "380", sellMode: "discount", sellList: "620", sellDisc1: "18",
    sellDisc2: "", sellRate: "", gstPct: "18",
  },
  {
    id: 3,
    name: "Modular switch 6A",
    qty: "25", costMode: "direct", costList: "", costDisc1: "", costDisc2: "",
    costRate: "72", sellMode: "direct", sellList: "", sellDisc1: "",
    sellDisc2: "", sellRate: "95", gstPct: "18",
  },
  {
    id: 4,
    name: "PVC conduit pipe 25mm heavy gauge",
    qty: "30", costMode: "discount", costList: "72", costDisc1: "40",
    costDisc2: "", costRate: "", sellMode: "discount", sellList: "72",
    sellDisc1: "33.3", sellDisc2: "", sellRate: "", gstPct: "18",
  },
  {
    id: 5,
    name: "Copper lug 35mm",
    qty: "12", costMode: "direct", costList: "", costDisc1: "", costDisc2: "",
    costRate: "98", sellMode: "direct", sellList: "", sellDisc1: "",
    sellDisc2: "", sellRate: "125", gstPct: "18",
  },
  {
    id: 6,
    name: "Ceiling fan box deep pattern",
    qty: "8", costMode: "direct", costList: "", costDisc1: "", costDisc2: "",
    costRate: "52", sellMode: "direct", sellList: "", sellDisc1: "",
    sellDisc2: "", sellRate: "70", gstPct: "18",
  },
];

/**
 * Pull the embedded images out of a jsPDF file.
 *
 * `sharePdf` adds each page with `addImage(..., "JPEG", ...)`, so every page is
 * one JPEG stream inside the PDF. Finding SOI/EOI markers is enough to recover
 * them, and recovering them is the point: the only way to know what the
 * customer sees is to look at the picture, not at the DOM it came from.
 */
function extractJpegs(pdf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let i = 0;
  while (i < pdf.length - 1) {
    if (pdf[i] === 0xff && pdf[i + 1] === 0xd8 && pdf[i + 2] === 0xff) {
      for (let j = i + 2; j < pdf.length - 1; j++) {
        if (pdf[j] === 0xff && pdf[j + 1] === 0xd9) {
          out.push(pdf.subarray(i, j + 2));
          i = j + 2;
          break;
        }
        if (j === pdf.length - 2) return out;
      }
    } else {
      i++;
    }
  }
  return out;
}

/** Width and height out of a JPEG's SOF marker. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15, excluding the non-frame markers in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * The case bug #8 was actually about, pushed as hard as the layout allows.
 *
 * `.cv-table` is `width: 100%` with automatic layout, so it can still be forced
 * wider than the 760px document by content that cannot wrap. Two things do
 * that: an unbreakable part number with no spaces in it, and crore-scale money,
 * which `formatMoney` groups Indian-style (₹9,98,99,001) and is the widest a
 * cell ever gets. If the table exceeds the node html2canvas captures, the
 * Amount column goes over the edge and out of the file — invisibly, because the
 * DOM still holds it.
 *
 * Twenty rows on top of that, to push the document past one A4 page and
 * exercise the slicing branch of `sharePdf`, which nothing has ever run.
 */
function stressLines(): UILine[] {
  const rows: UILine[] = [
    {
      id: 1,
      name: "FINOLEX-FRPVC-COPPERWIRE-1.5SQMM-90MCOIL-PARTNO-FX155090RD",
      qty: "999", costMode: "direct", costList: "", costDisc1: "", costDisc2: "",
      costRate: "70000", sellMode: "direct", sellList: "", sellDisc1: "",
      sellDisc2: "", sellRate: "99999", gstPct: "18",
    },
  ];
  for (let i = 2; i <= 20; i++) {
    rows.push({
      id: i,
      name: `Line item ${i} — modular accessory, deep pattern`,
      qty: String(i), costMode: "discount", costList: "1200", costDisc1: "45",
      costDisc2: "2.5", costRate: "", sellMode: "discount", sellList: "1200",
      sellDisc1: "38.5", sellDisc2: "1.25", sellRate: "", gstPct: "18",
    });
  }
  return rows;
}

async function seedQuote(customerId: string, name: string, lines: UILine[]) {
  const ref = doc(collection(db, "quotes"));
  await setDoc(ref, {
    customerId, customerName: TAG, name, lines,
    totalSale: 0, status: "draft",
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  return ref;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // --- seed --------------------------------------------------------------
  const customerRef = doc(collection(db, "customers"));
  await setDoc(customerRef, {
    name: TAG,
    phone: "+91 98765 43210",
    address: "12-4-87 Balaji Complex, Kothapet, Guntur 522001",
    createdAt: Date.now(),
  });
  const quoteRef = await seedQuote(customerRef.id, "Site wiring — first floor", LINES);
  const stressRef = await seedQuote(customerRef.id, "ZZ stress — wide and long", stressLines());

  // --- drive -------------------------------------------------------------
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  // A phone, because bug #8 was a phone-width bug: html2canvas rasterises at
  // whatever width the node is rendered at.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    acceptDownloads: true,
  });
  // Force `sharePdf`'s download branch.
  //
  // Headless Chrome has `navigator.share`, and it RESOLVES — silently, with no
  // share sheet and no file anywhere. So the first run of this check looked
  // like a hang: no download, no error, the button back to normal. The PDF had
  // been built and handed to a share sheet that does not exist.
  //
  // The blob is built before that branch and both branches receive the same
  // one, so this changes how the file is delivered and not a byte of what is
  // in it. The Web Share arm itself needs a real device — it is the last line
  // of TESTING.md's handover list for that reason.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false });
  });

  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleLines: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));

  /** Open one quote, share it, and open the file that lands. */
  async function shareAndInspect(quoteName: string, label: string, slug: string) {
    console.log(`\n=== ${label} ===`);

    // NOT networkidle: the app holds an open Firestore WebChannel Listen stream
    // for as long as it is on screen, so the network is never idle and the wait
    // always times out. Wait for the thing we actually need instead.
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.getByText(TAG).first().waitFor({ timeout: 30_000 });
    await page.getByText(TAG).first().click();
    await page.locator(".cs-row-main", { hasText: quoteName }).first().click();
    await page.locator(".qe-viewtoggle button", { hasText: "Customer" }).click();
    await page.locator(".cv-doc").waitFor({ state: "visible" });

    // Every column is on by default; assert it rather than assume it, since
    // "all five columns on" is the whole condition bug #8 needed.
    const active = await page.locator(".cv-col-btn.active").allTextContents();
    check(`${label}: all five columns are on before sharing`, active.length === 5, active.join(", "));

    // What the DOM says. This is the claim PI-2 made and could not back up.
    const geom = await page.locator(".cv-doc").evaluate((el) => {
      const table = el.querySelector(".cv-table") as HTMLElement | null;
      const box = el.getBoundingClientRect();
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        tableWidth: table?.getBoundingClientRect().width ?? 0,
        docRight: box.right,
        tableRight: table?.getBoundingClientRect().right ?? 0,
        // Where each item row sits, measured from the top of the captured
        // node, so a page break can be checked against it.
        rows: Array.from(el.querySelectorAll(".cv-table tbody tr")).map((tr) => {
          const r = tr.getBoundingClientRect();
          return { top: r.top - box.top, bottom: r.bottom - box.top };
        }),
      };
    });
    check(
      `${label}: the document is pinned to 760px on a 390px screen`,
      geom.clientWidth === 760,
      `clientWidth ${geom.clientWidth}`
    );
    // The mechanism, checked directly: if the table is wider than the box
    // html2canvas captures, the Amount column falls off the right of the file.
    check(
      `${label}: the item table does not spill past the captured document`,
      geom.tableRight <= geom.docRight + 0.5,
      `table right ${geom.tableRight.toFixed(1)} vs document right ${geom.docRight.toFixed(1)}`
    );

    const amountHeader = await page.locator(".cv-table thead th").last().textContent();
    check(`${label}: Amount is the last column in the DOM`, /amount/i.test(amountHeader ?? ""), `"${amountHeader}"`);

    // --- the actual file ---------------------------------------------------
    const downloadPromise = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
    await page.locator(".cv-share").click();
    const download = await downloadPromise;

    if (!download) {
      const msg = await page.locator(".cv-share-msg").textContent().catch(() => null);
      const btn = await page.locator(".cv-share").textContent().catch(() => null);
      check(`${label}: the Share button produced a file`, false,
        `button reads ${JSON.stringify(btn)}; on-screen message: ${JSON.stringify(msg)}`);
      console.log("\n  page console:\n" + consoleLines.map((l) => "    " + l).join("\n"));
      return;
    }

    const pdfPath = resolve(OUT, `${slug}.pdf`);
    await download.saveAs(pdfPath);

    const { readFileSync } = await import("node:fs");
    const pdf = readFileSync(pdfPath);
    check(`${label}: a PDF was produced`, pdf.subarray(0, 5).toString() === "%PDF-", `${pdf.length} bytes`);

    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    const jpegs = extractJpegs(pdf);
    console.log(`  ${pdfPath}\n  ${pdf.length} bytes, ${pageCount} page(s), ${jpegs.length} image(s)`);
    check(`${label}: the PDF carries a rasterised page image`, jpegs.length > 0, `${jpegs.length} image(s)`);

    let totalImageHeight = 0;
    for (const [i, jpeg] of jpegs.entries()) {
      const size = jpegSize(jpeg);
      totalImageHeight += size?.height ?? 0;
      const file = resolve(OUT, `${slug}-page-${i + 1}.jpg`);
      writeFileSync(file, jpeg);
      console.log(`    page ${i + 1}: ${size?.width}x${size?.height}px -> ${file}`);

      // html2canvas runs at scale 2, so a 760px node must rasterise at 1520px.
      // Narrower means the capture was clipped — bug #8's exact mechanism, and
      // the thing no DOM check could ever see.
      check(
        `${label}: page ${i + 1} is the full 760px document at scale 2 (not clipped)`,
        size?.width === 1520,
        `${size?.width}px wide, expected 1520`
      );
    }

    // Nothing may be lost between pages. `sharePdf` slices the canvas into
    // page-sized bands, and an off-by-one there would drop a row silently —
    // the same class of invisible loss as the clipped column.
    const expectedHeight = Math.round(geom.scrollHeight * 2);
    check(
      `${label}: the pages add up to the whole document, no rows dropped`,
      Math.abs(totalImageHeight - expectedHeight) <= 4,
      `${totalImageHeight}px of image vs ${expectedHeight}px of document`
    );

    // A break that lands mid-row cuts the text through the middle of the
    // glyphs — the item name on one page, the rest of its own row on the next.
    // Nothing is lost, but it is the customer's copy of the quotation.
    // html2canvas renders at scale 2, so document px x2 = canvas px.
    const breaks: number[] = [];
    let acc = 0;
    for (const jpeg of jpegs.slice(0, -1)) {
      acc += jpegSize(jpeg)?.height ?? 0;
      breaks.push(acc);
    }
    const cut = breaks.filter((b) =>
      geom.rows.some((r) => r.top * 2 < b - 1 && b + 1 < r.bottom * 2)
    );
    check(
      `${label}: no page break cuts through an item row`,
      cut.length === 0,
      cut.length
        ? `break(s) at ${cut.join(", ")}px land inside a row`
        : `${breaks.length} break(s), all between rows`
    );
  }

  try {
    await shareAndInspect("Site wiring — first floor", "typical quote", "typical");
    await shareAndInspect("ZZ stress — wide and long", "stress: unbreakable name, crore amounts, 20 rows", "stress");
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    await context.close();
    await browser.close();
    await deleteDoc(quoteRef).catch(() => {});
    await deleteDoc(stressRef).catch(() => {});
    await deleteDoc(customerRef).catch(() => {});
  }
}

main()
  .catch((e) => check("ran without throwing", false, String(e)))
  .finally(async () => {
    const failed = results.filter(([, pass]) => !pass).length;
    console.log(
      failed === 0
        ? `\nall ${results.length} checks passed`
        : `\n${failed} of ${results.length} FAILED`
    );
    await deleteApp(app);
    process.exit(failed === 0 ? 0 : 1);
  });
