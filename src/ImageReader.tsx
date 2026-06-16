import { useRef, useState } from "react";
import { readImageItems, type ReadItem } from "./readImage";
import "./ImageReader.css";

interface Props {
  onAdd: (items: ReadItem[]) => void;
  onClose: () => void;
}

type Stage = "idle" | "reading" | "confirming" | "error";

interface ConfirmItem extends ReadItem {
  _id: number;
  checked: boolean;
}

let _itemSeq = 0;

export function ImageReaderPanel({ onAdd, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [items, setItems] = useState<ConfirmItem[]>([]);
  const [notes, setNotes] = useState("");

  function handleFileChange(file: File) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageFile(file);
    setStage("idle");
    setItems([]);
    setError("");
    setNotes("");
  }

  async function handleRead() {
    if (!imageFile) return;
    setStage("reading");
    setError("");
    try {
      const result = await readImageItems(imageFile);
      setItems(
        result.items.map((it) => ({ ...it, _id: _itemSeq++, checked: true }))
      );
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
    onClose();
  }

  const checkedCount = items.filter((it) => it.checked).length;

  return (
    <div
      className="ir-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ir-panel">
        <div className="ir-header">
          <span className="ir-title">Read from image</span>
          <button className="ir-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileChange(f);
            e.target.value = "";
          }}
        />

        {!imageUrl && (
          <div className="ir-prompt">
            <button className="ir-camera-btn" onClick={() => fileRef.current?.click()}>
              📷 Take photo / Choose image
            </button>
            <p className="ir-hint">Supports Telugu &amp; English handwriting or printed lists</p>
          </div>
        )}

        {imageUrl && (
          <div className="ir-preview-wrap">
            <img className="ir-preview" src={imageUrl} alt="Selected" />
            <button
              className="ir-retake"
              onClick={() => fileRef.current?.click()}
            >
              Retake / Change
            </button>
          </div>
        )}

        {imageUrl && stage !== "reading" && stage !== "confirming" && (
          <button className="ir-read-btn" onClick={handleRead}>
            Read items from image
          </button>
        )}

        {stage === "reading" && (
          <div className="ir-loading">
            <span className="ir-spinner" />
            Reading image…
          </div>
        )}

        {stage === "error" && (
          <div className="ir-error">
            <span>⚠ {error}</span>
            <button className="ir-retry-btn" onClick={handleRead}>
              Retry
            </button>
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
            <div className="ir-confirm-hd">
              Found {items.length} item{items.length !== 1 ? "s" : ""} — review and add:
            </div>

            {notes && <div className="ir-notes">Note: {notes}</div>}

            <div className="ir-items">
              {items.map((it) => (
                <div key={it._id} className={"ir-item" + (it.checked ? "" : " ir-item-unchecked")}>
                  <input
                    type="checkbox"
                    className="ir-item-check"
                    checked={it.checked}
                    onChange={(e) => patchItem(it._id, { checked: e.target.checked })}
                  />
                  <input
                    className="ir-item-name"
                    value={it.name}
                    placeholder="Item name"
                    onChange={(e) => patchItem(it._id, { name: e.target.value })}
                  />
                  <label className="ir-item-field">
                    <span>Qty</span>
                    <input
                      className="ir-item-num"
                      value={it.qty}
                      inputMode="numeric"
                      onChange={(e) =>
                        patchItem(it._id, { qty: parseInt(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="ir-item-field">
                    <span>Rate</span>
                    <input
                      className="ir-item-num"
                      value={it.rate ?? ""}
                      inputMode="decimal"
                      placeholder="—"
                      onChange={(e) =>
                        patchItem(it._id, {
                          rate: e.target.value.trim() === "" ? null : parseFloat(e.target.value) || null,
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            <button
              className="ir-add-btn"
              disabled={checkedCount === 0}
              onClick={handleAdd}
            >
              Add {checkedCount} item{checkedCount !== 1 ? "s" : ""} to quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
