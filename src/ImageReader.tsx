import { useEffect, useRef, useState } from "react";
import { readImageItems, type ReadItem } from "./readImage";
import { mergePages, type PageResult } from "./parse/mergePages";
import { movePage } from "./parse/movePage";
import { parseQty } from "./types";
import { log } from "./log/logger";
import { appConfig } from "../config/app.config";
import "./ImageReader.css";

interface Props {
  onAdd: (items: ReadItem[]) => void;
  onClose: () => void;
}

type Stage = "idle" | "camera" | "reading" | "confirming" | "error";

/** One photo waiting to be read. A long order list runs to several. */
interface PageFile {
  id: number;
  url: string;
  blob: Blob;
}

interface ConfirmItem extends ReadItem {
  _id: number;
  checked: boolean;
  /** 1-based page this row came from, so Dad can tell duplicates apart. */
  page: number;
  // Qty/rate held as the text the user is actively typing, parsed only at
  // commit (handleAdd). A number input re-parsed on every keystroke gets its
  // DOM value stomped by React mid-edit — "2." becomes "2" before the "5" is
  // ever typed, silently turning 2.5 into 25.
  _qtyRaw: string;
  _rateRaw: string;
}

let _itemSeq = 0;
let _pageSeq = 0;

function toConfirmItem(it: ReadItem & { page: number }): ConfirmItem {
  return {
    ...it,
    _id: _itemSeq++,
    checked: true,
    _qtyRaw: String(it.qty ?? ""),
    _rateRaw: it.rate == null ? "" : String(it.rate),
  };
}

export function ImageReaderPanel({ onAdd, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [pages, setPages] = useState<PageFile[]>([]);
  const [pageResults, setPageResults] = useState<PageResult[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [items, setItems] = useState<ConfirmItem[]>([]);
  const [notes, setNotes] = useState("");
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmLong, setConfirmLong] = useState(false);

  // Reading a photo is the one thing in this app that genuinely needs a
  // connection. Say so before Dad takes the photo, not after he has waited.
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function resetRead() {
    setItems([]);
    setNotes("");
    setFailedPages([]);
    setPageResults([]);
    setStage("idle");
    setConfirmLong(false);
  }

  async function openCamera() {
    setError("");
    setStage("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setStage("idle");
      setError("Camera not available — please use 'Choose image' below.");
    }
  }

  // The camera stays one shot per capture — it cannot multi-select — but each
  // capture appends, so photographing a three-page list works the same way as
  // picking three files.
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      setPages((prev) => [
        ...prev,
        { id: _pageSeq++, url: URL.createObjectURL(blob), blob },
      ]);
      resetRead();
    }, "image/jpeg", 0.92);
  }

  /** Picking files replaces the set — that is what "choose" means. */
  function handleFilesChosen(files: File[]) {
    if (files.length === 0) return;
    stopCamera();
    for (const p of pages) URL.revokeObjectURL(p.url);
    setPages(
      files.map((f) => ({ id: _pageSeq++, url: URL.createObjectURL(f), blob: f }))
    );
    setError("");
    resetRead();
  }

  function removePage(id: number) {
    setPages((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
    resetRead();
  }

  /**
   * Reordering is offered only before the read starts. Reordering *results* is
   * a different and much larger problem, and merged rows already carry the page
   * they came from.
   */
  function reorderPage(from: number, to: number) {
    const next = movePage(pages, from, to);
    if (next === pages) return;
    log.debug("image", "pages reordered", { from, to, count: pages.length });
    setPages(next);
    resetRead();
  }

  /** One page. Never throws — a failure is a `PageResult` the merge understands. */
  async function readOne(page: PageFile): Promise<PageResult> {
    try {
      const file =
        page.blob instanceof File
          ? page.blob
          : new File([page.blob], "photo.jpg", { type: "image/jpeg" });
      const result = await readImageItems(file);
      if (result.notes) setNotes(result.notes);
      return { ok: true, items: result.items };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Reading failed. Please try again.",
      };
    }
  }

  async function handleRead() {
    if (pages.length === 0) return;
    setStage("reading");
    setError("");
    setNotes("");
    const startedAt = Date.now();

    // Sequential, one call per page, never batched (spec §5.2). A long list
    // already sits against a single 8192-token ceiling — the first suspect for
    // an empty read — and sharing that budget across pages would make a known
    // risk worse to save a few cents.
    const results: PageResult[] = [];
    for (let i = 0; i < pages.length; i++) {
      setProgress({ current: i + 1, total: pages.length });
      results.push(await readOne(pages[i]));
    }
    setProgress(null);
    setPageResults(results);

    const merged = mergePages(results);
    setItems(merged.items.map(toConfirmItem));
    setFailedPages(merged.failed);

    log.info("image", "multi-page read finished", {
      pageCount: pages.length,
      itemCount: merged.items.length,
      failed: merged.failed,
      ms: Date.now() - startedAt,
    });

    // Every page failing is the old single-page failure, and keeps the old
    // behaviour: the honest message (offline, 403, whatever it was) plus a
    // Retry, rather than an empty confirm list that explains nothing.
    if (merged.items.length === 0 && merged.failed.length === pages.length) {
      const first = results.find((r) => !r.ok);
      setError(!first?.ok ? first?.error ?? "Reading failed." : "Reading failed.");
      setStage("error");
      return;
    }
    setStage("confirming");
  }

  /**
   * Re-read one page and slot its items back into place.
   *
   * The pages that worked keep their rows *and any edits Dad has already made
   * to them* — re-reading everything would throw that typing away, which is
   * the opposite of what a retry should cost him.
   */
  async function retryPage(pageNumber: number) {
    const page = pages[pageNumber - 1];
    if (!page) return;

    setStage("reading");
    setProgress({ current: pageNumber, total: pages.length });
    const result = await readOne(page);
    setProgress(null);

    const next = [...pageResults];
    next[pageNumber - 1] = result;
    setPageResults(next);

    const merged = mergePages(next);
    setFailedPages(merged.failed);
    setItems((prev) => {
      const kept = prev.filter((it) => it.page !== pageNumber);
      const fresh = merged.items
        .filter((it) => it.page === pageNumber)
        .map(toConfirmItem);
      // Array.sort is stable, so within-page order survives.
      return [...kept, ...fresh].sort((a, b) => a.page - b.page);
    });
    setStage("confirming");
  }

  function patchItem(id: number, patch: Partial<ConfirmItem>) {
    setItems((prev) => prev.map((x) => (x._id === id ? { ...x, ...patch } : x)));
  }

  function handleAdd() {
    onAdd(
      items
        .filter((it) => it.checked)
        .map((it) => ({
          name: it.name,
          qty: parseQty(it._qtyRaw),
          rate: it._rateRaw.trim() === "" ? null : (parseFloat(it._rateRaw) || null),
        }))
    );
    stopCamera();
    onClose();
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  const checkedCount = items.filter((it) => it.checked).length;
  const multi = pages.length > 1;

  // A row with no rate is added with a blank sell price and quietly totals ₹0.
  // The editor's existing warning only covers the cost side, so this is the one
  // place that can catch it.
  const needNumbers = items.filter(
    (it) => it.checked && (it._rateRaw.trim() === "" || !(parseQty(it._qtyRaw) > 0))
  ).length;

  return (
    <div className="ir-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="ir-panel">
        <div className="ir-header">
          <span className="ir-title">Read from image</span>
          <button className="ir-close" onClick={handleClose}>✕</button>
        </div>

        {!online && (
          <div className="ir-offline">
            📶 No internet connection. Reading a photo needs one — the rest of
            the app keeps working offline.
          </div>
        )}

        {/* Live camera view */}
        {stage === "camera" && (
          <div className="ir-camera-view">
            <video ref={videoRef} className="ir-video" playsInline muted autoPlay />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <button className="ir-capture-btn" onClick={capturePhoto}>📸 Capture</button>
            <button className="ir-cancel-cam" onClick={() => { stopCamera(); setStage("idle"); }}>Cancel</button>
          </div>
        )}

        {/* Idle: no image yet */}
        {stage === "idle" && pages.length === 0 && (
          <div className="ir-prompt">
            <button className="ir-camera-btn" onClick={openCamera}>
              📷 Take photo
            </button>
            <label className="ir-gallery-btn">
              🖼 Choose from gallery
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => { handleFilesChosen(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
            </label>
            {error && <p className="ir-hint" style={{ color: "#dc2626" }}>{error}</p>}
            <p className="ir-hint">
              Supports Telugu &amp; English handwriting or printed lists.
              A long list? Pick or photograph every page.
            </p>
          </div>
        )}

        {/* Page strip */}
        {pages.length > 0 && stage !== "camera" && (
          <div className="ir-pages-wrap">
            <div className="ir-pages">
              {pages.map((p, i) => (
                <div className="ir-page" key={p.id}>
                  <img className="ir-page-img" src={p.url} alt={`Page ${i + 1}`} />
                  {multi && <span className="ir-page-num">p{i + 1}</span>}
                  {multi && stage === "idle" && (
                    <div className="ir-page-move">
                      <button
                        className="ir-page-up"
                        aria-label={`Move page ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() => reorderPage(i, i - 1)}
                      >
                        ▲
                      </button>
                      <button
                        className="ir-page-down"
                        aria-label={`Move page ${i + 1} later`}
                        disabled={i === pages.length - 1}
                        onClick={() => reorderPage(i, i + 1)}
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  <button
                    className="ir-page-remove"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() => removePage(p.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="ir-retake-row">
              <button className="ir-retake" onClick={openCamera}>📷 Add photo</button>
              <label className="ir-retake">
                🖼 Gallery
                <input type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={(e) => { handleFilesChosen(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        )}

        {pages.length > 0 && stage === "idle" && !confirmLong && (
          <button
            className="ir-read-btn"
            onClick={() =>
              pages.length >= appConfig.image.longReadPages
                ? setConfirmLong(true)
                : handleRead()
            }
          >
            {multi ? `Read ${pages.length} pages` : "Read items from image"}
          </button>
        )}

        {confirmLong && stage === "idle" && (
          <div className="ir-longread">
            <p>
              {pages.length} pages are read one at a time, so this takes about{" "}
              <b>{Math.round((pages.length * appConfig.image.secondsPerPage) / 5) * 5} seconds</b>.
              Keep the app open while it works.
            </p>
            <div className="ir-longread-actions">
              <button onClick={() => setConfirmLong(false)}>Back</button>
              <button
                className="ir-longread-go"
                onClick={() => { setConfirmLong(false); handleRead(); }}
              >
                Read {pages.length} pages
              </button>
            </div>
          </div>
        )}

        {stage === "reading" && (
          <div className="ir-loading">
            <span className="ir-spinner" />
            {progress && progress.total > 1
              ? `Reading page ${progress.current} of ${progress.total}…`
              : "Reading image…"}
          </div>
        )}

        {stage === "error" && (
          <div className="ir-error">
            <span>⚠ {error}</span>
            <button className="ir-retry-btn" onClick={handleRead}>Retry</button>
          </div>
        )}

        {stage === "confirming" && items.length === 0 && failedPages.length === 0 && (
          <div className="ir-empty">
            No items found — try a clearer photo or add items manually.
            {notes && <div className="ir-empty-notes">{notes}</div>}
          </div>
        )}

        {stage === "confirming" && (items.length > 0 || failedPages.length > 0) && (
          <div className="ir-confirm">
            <div className="ir-confirm-hd">
              Found {items.length} item{items.length !== 1 ? "s" : ""}
              {multi ? ` across ${pages.length} pages` : ""} — review and add:
            </div>
            {notes && <div className="ir-notes">Note: {notes}</div>}

            {/* Partial failure is normal, not exceptional (spec §5.3). Losing a
                five-page order to one blurry photo is the failure Dad would
                actually hit, so the good pages stay and only the bad one is
                re-shot. */}
            {failedPages.map((n) => (
              <div className="ir-failed-page" key={n}>
                <span>⚠ Page {n} could not be read.</span>
                <button className="ir-retry-page" onClick={() => retryPage(n)}>
                  Retry page {n}
                </button>
              </div>
            ))}

            <div className="ir-items">
              {items.map((it) => (
                <div key={it._id} className={"ir-item" + (it.checked ? "" : " ir-item-unchecked")}>
                  <input type="checkbox" className="ir-item-check" checked={it.checked}
                    onChange={(e) => patchItem(it._id, { checked: e.target.checked })} />
                  {multi && <span className="ir-item-page">p{it.page}</span>}
                  <input className="ir-item-name" value={it.name} placeholder="Item name"
                    onChange={(e) => patchItem(it._id, { name: e.target.value })} />
                  <label className="ir-item-field">
                    <span>Qty</span>
                    <input className="ir-item-num" value={it._qtyRaw} inputMode="decimal"
                      onChange={(e) => patchItem(it._id, { _qtyRaw: e.target.value })} />
                  </label>
                  <label className="ir-item-field">
                    <span>Rate</span>
                    <input className="ir-item-num" value={it._rateRaw} inputMode="decimal" placeholder="—"
                      onChange={(e) => patchItem(it._id, { _rateRaw: e.target.value })} />
                  </label>
                </div>
              ))}
            </div>
            {needNumbers > 0 && (
              <div className="ir-incomplete">
                ⚠ {needNumbers} item{needNumbers !== 1 ? "s" : ""} still
                {needNumbers !== 1 ? " need" : " needs"} a qty or rate — fill
                {needNumbers !== 1 ? " them" : " it"} in here, or the line is
                added at ₹0.
              </div>
            )}
            <button className="ir-add-btn" disabled={checkedCount === 0} onClick={handleAdd}>
              Add {checkedCount} item{checkedCount !== 1 ? "s" : ""} to quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
