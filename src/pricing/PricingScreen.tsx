import { useMemo, useState } from "react";
import { resolvePrice } from "../calc/engine";
import { formatINR } from "../format";
import { type ItemDoc } from "../types";
import { usePricing, blankItem } from "./usePricing";
import { toPriceMode } from "../shared/priceMode";
import { PriceSide, type SidePatch } from "../quotations/QuoteEditor";
import { ImageReaderPanel } from "../shared/ImageReader";
import { type ReadItem } from "../readImage";
import "./PricingScreen.css";

interface Props {
  onBack: () => void;
}

type DraftItem = Omit<ItemDoc, "id" | "updatedAt">;

export function PricingScreen({ onBack }: Props) {
  const { items, loading, addItem, updateItem, deleteItem, mergeFromImage } = usePricing();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<DraftItem>(blankItem());
  const [saving, setSaving] = useState(false);
  const [showImageReader, setShowImageReader] = useState(false);
  const [showBrandPrompt, setShowBrandPrompt] = useState(false);
  const [uploadBrand, setUploadBrand] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = items.filter(
    (it) =>
      it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.brand.toLowerCase().includes(search.toLowerCase())
  );

  function resolvedCostOf(it: DraftItem) {
    return resolvePrice(toPriceMode(it.costMode, it.costList, it.costDisc1, it.costDisc2, it.costRate));
  }

  const draftResolvedCost = useMemo(() => resolvedCostOf(draft), [draft]);

  function openNew() {
    setDraft(blankItem());
    setEditingId("new");
  }

  function openEdit(it: ItemDoc) {
    setDraft({
      name: it.name, brand: it.brand, unit: it.unit,
      costMode: it.costMode, costList: it.costList, costDisc1: it.costDisc1, costDisc2: it.costDisc2, costRate: it.costRate,
      source: it.source,
    });
    setEditingId(it.id);
  }

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    if (editingId === "new") {
      await addItem(draft);
    } else if (editingId) {
      await updateItem(editingId, draft);
    }
    setSaving(false);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteItem(id);
    setDeleteId(null);
    setEditingId(null);
  }

  function handleAddFromImage(readItems: ReadItem[]) {
    mergeFromImage(readItems.map((it) => ({ name: it.name, rate: it.rate })), uploadBrand);
  }

  function patchCost(p: SidePatch) {
    setDraft((d) => ({
      ...d,
      costMode: p.mode ?? d.costMode, costList: p.list ?? d.costList,
      costDisc1: p.disc1 ?? d.costDisc1, costDisc2: p.disc2 ?? d.costDisc2, costRate: p.rate ?? d.costRate,
    }));
  }

  return (
    <div className="pr">
      <div className="pr-top">
        <button className="pr-back" onClick={onBack} aria-label="Back to dashboard">←</button>
        <h1 className="pr-title">Pricing</h1>
      </div>

      <div className="pr-head">
        <div>
          <h2>Catalog</h2>
          <p>Vendor cost reference — sell price is still set per quote</p>
        </div>
        <div className="pr-head-actions">
          <button className="pr-btn-soft" onClick={() => setShowBrandPrompt(true)}>
            Upload image
          </button>
          <button className="pr-btn-add" onClick={openNew}>+ Add Item</button>
        </div>
      </div>

      <div className="pr-search-wrap">
        <input
          className="pr-search"
          value={search}
          placeholder="Search items or brand..."
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          aria-label="Search items"
        />
      </div>

      {loading ? (
        <div className="pr-list" aria-busy="true">
          {[0, 1, 2].map((i) => <div className="pr-skel" key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="pr-empty">
          {search ? (
            <>
              <p className="pr-empty-title">No items match "{search}"</p>
              <button className="pr-empty-clear" onClick={() => setSearch("")}>Clear search</button>
            </>
          ) : (
            <>
              <p className="pr-empty-title">No items yet</p>
              <p className="pr-empty-sub">Add items by hand, or photograph a vendor price list.</p>
              <button className="pr-btn-add" onClick={openNew}>+ Add Item</button>
            </>
          )}
        </div>
      ) : (
        <div className="pr-list">
          {filtered.map((it) => {
            const cost = resolvedCostOf(it);
            return (
              <button key={it.id} className="pr-row" onClick={() => openEdit(it)}>
                <span className="pr-row-main">
                  <span className="pr-row-name">{it.name}</span>
                  <span className="pr-row-meta">
                    {it.brand && <span className="pr-chip">{it.brand}</span>}
                    {it.unit && <span>{it.unit}</span>}
                    {it.source === "image" && <span className="pr-chip">from image</span>}
                  </span>
                </span>
                <span className="pr-row-prices tnum">
                  <span className="pr-row-cost">{formatINR(cost, 2)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {editingId && (
        <div
          className="qe-sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingId(null); }}
        >
          <div className="qe-sheet" role="dialog" aria-label={editingId === "new" ? "Add item" : "Edit item"}>
            <div className="qe-sheet-head">
              <span className="qe-sheet-title">{editingId === "new" ? "New Item" : "Edit Item"}</span>
              <button className="qe-sheet-close" onClick={() => setEditingId(null)} aria-label="Close">✕</button>
            </div>

            <div className="qe-sheet-body">
              <label className="qe-field">
                <span>Item name</span>
                <input
                  className="qe-input"
                  value={draft.name}
                  placeholder="e.g. 2.5 sqmm copper wire"
                  autoFocus
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>

              <label className="qe-field qe-field-third">
                <span>Brand</span>
                <input
                  className="qe-input"
                  value={draft.brand}
                  placeholder="e.g. Finolex"
                  onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                />
              </label>

              <label className="qe-field qe-field-third">
                <span>Unit</span>
                <input
                  className="qe-input"
                  value={draft.unit}
                  placeholder="per piece / per metre"
                  onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                />
              </label>

              <PriceSide
                kind="cost"
                label="Cost — what you pay"
                mode={draft.costMode} list={draft.costList} disc1={draft.costDisc1} disc2={draft.costDisc2} rate={draft.costRate}
                resolved={draftResolvedCost} total={draftResolvedCost}
                onChange={patchCost}
              />
            </div>

            <div className="qe-sheet-actions">
              {deleteId === editingId ? (
                <>
                  <span className="qe-sheet-confirm">Delete this item?</span>
                  <button className="qe-del-yes" onClick={() => handleDelete(editingId as string)}>Delete</button>
                  <button className="qe-del-no" onClick={() => setDeleteId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  {editingId !== "new" && (
                    <button className="qe-btn-danger" onClick={() => setDeleteId(editingId)}>
                      Delete item
                    </button>
                  )}
                  <button className="qe-btn-primary" onClick={handleSave} disabled={!draft.name.trim() || saving}>
                    {saving ? "Saving…" : "Done"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showBrandPrompt && (
        <div
          className="qe-sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBrandPrompt(false); }}
        >
          <div className="qe-sheet" role="dialog" aria-label="Brand for this upload">
            <div className="qe-sheet-head">
              <span className="qe-sheet-title">Whose price list is this?</span>
              <button className="qe-sheet-close" onClick={() => setShowBrandPrompt(false)} aria-label="Close">✕</button>
            </div>
            <div className="qe-sheet-body">
              <label className="qe-field">
                <span>Brand</span>
                <input
                  className="qe-input"
                  value={uploadBrand}
                  placeholder="e.g. Finolex — leave blank if no brand split"
                  autoFocus
                  onChange={(e) => setUploadBrand(e.target.value)}
                />
              </label>
              <p className="qe-note">
                Every item from this photo gets tagged with this brand. Use a
                separate upload per brand's price list.
              </p>
            </div>
            <div className="qe-sheet-actions">
              <button
                className="qe-btn-primary"
                onClick={() => { setShowBrandPrompt(false); setShowImageReader(true); }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageReader && (
        <ImageReaderPanel onAdd={handleAddFromImage} onClose={() => setShowImageReader(false)} />
      )}
    </div>
  );
}
