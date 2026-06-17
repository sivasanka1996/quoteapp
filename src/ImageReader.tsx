import { useRef, useState } from "react";
import { readImageItems, type ReadItem } from "./readImage";
import "./ImageReader.css";

interface Props {
  onAdd: (items: ReadItem[]) => void;
  onClose: () => void;
}

type Stage = "idle" | "camera" | "reading" | "confirming" | "error";

interface ConfirmItem extends ReadItem {
  _id: number;
  checked: boolean;
}

let _itemSeq = 0;

export function ImageReaderPanel({ onAdd, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [items, setItems] = useState<ConfirmItem[]>([]);
  const [notes, setNotes] = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      setImageBlob(blob);
      setStage("idle");
      setItems([]);
      setNotes("");
    }, "image/jpeg", 0.92);
  }

  function handleFileChange(file: File) {
    stopCamera();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageBlob(file);
    setStage("idle");
    setItems([]);
    setError("");
    setNotes("");
  }

  async function handleRead() {
    if (!imageBlob) return;
    setStage("reading");
    setError("");
    try {
      const file = imageBlob instanceof File
        ? imageBlob
        : new File([imageBlob], "photo.jpg", { type: "image/jpeg" });
      const result = await readImageItems(file);
      setItems(result.items.map((it) => ({ ...it, _id: _itemSeq++, checked: true })));
      setNotes(result.notes ?? "");
      setStage("confirming");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reading failed. Please try again.");
      setStage("error");
    }
  }

  function patchItem(id: number, patch: Partial<ConfirmItem>) {
    setItems((prev) => prev.map((x) => (x._id === id ? { ...x, ...patch } : x)));
  }

  function handleAdd() {
    onAdd(items.filter((it) => it.checked));
    stopCamera();
    onClose();
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  const checkedCount = items.filter((it) => it.checked).length;

  return (
    <div className="ir-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="ir-panel">
        <div className="ir-header">
          <span className="ir-title">Read from image</span>
          <button className="ir-close" onClick={handleClose}>✕</button>
        </div>

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
        {stage === "idle" && !imageUrl && (
          <div className="ir-prompt">
            <button className="ir-camera-btn" onClick={openCamera}>
              📷 Take photo
            </button>
            <label className="ir-gallery-btn">
              🖼 Choose from gallery
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); e.target.value = ""; }}
              />
            </label>
            {error && <p className="ir-hint" style={{ color: "#dc2626" }}>{error}</p>}
            <p className="ir-hint">Supports Telugu &amp; English handwriting or printed lists</p>
          </div>
        )}

        {/* Image preview */}
        {imageUrl && stage !== "camera" && (
          <div className="ir-preview-wrap">
            <img className="ir-preview" src={imageUrl} alt="Selected" />
            <div className="ir-retake-row">
              <button className="ir-retake" onClick={openCamera}>📷 Retake</button>
              <label className="ir-retake">
                🖼 Gallery
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        )}

        {imageUrl && stage === "idle" && (
          <button className="ir-read-btn" onClick={handleRead}>Read items from image</button>
        )}

        {stage === "reading" && (
          <div className="ir-loading"><span className="ir-spinner" />Reading image…</div>
        )}

        {stage === "error" && (
          <div className="ir-error">
            <span>⚠ {error}</span>
            <button className="ir-retry-btn" onClick={handleRead}>Retry</button>
          </div>
        )}

        {stage === "confirming" && items.length === 0 && (
          <div className="ir-empty">
            No items found — try a clearer photo or add items manually.
            {notes && <div className="ir-empty-notes">{notes}</div>}
          </div>
        )}

        {stage === "confirming" && items.length > 0 && (
          <div className="ir-confirm">
            <div className="ir-confirm-hd">Found {items.length} item{items.length !== 1 ? "s" : ""} — review and add:</div>
            {notes && <div className="ir-notes">Note: {notes}</div>}
            <div className="ir-items">
              {items.map((it) => (
                <div key={it._id} className={"ir-item" + (it.checked ? "" : " ir-item-unchecked")}>
                  <input type="checkbox" className="ir-item-check" checked={it.checked}
                    onChange={(e) => patchItem(it._id, { checked: e.target.checked })} />
                  <input className="ir-item-name" value={it.name} placeholder="Item name"
                    onChange={(e) => patchItem(it._id, { name: e.target.value })} />
                  <label className="ir-item-field">
                    <span>Qty</span>
                    <input className="ir-item-num" value={it.qty} inputMode="numeric"
                      onChange={(e) => patchItem(it._id, { qty: parseInt(e.target.value) || 0 })} />
                  </label>
                  <label className="ir-item-field">
                    <span>Rate</span>
                    <input className="ir-item-num" value={it.rate ?? ""} inputMode="decimal" placeholder="—"
                      onChange={(e) => patchItem(it._id, { rate: e.target.value.trim() === "" ? null : parseFloat(e.target.value) || null })} />
                  </label>
                </div>
              ))}
            </div>
            <button className="ir-add-btn" disabled={checkedCount === 0} onClick={handleAdd}>
              Add {checkedCount} item{checkedCount !== 1 ? "s" : ""} to quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
