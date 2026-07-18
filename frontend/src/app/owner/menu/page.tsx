"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import { Camera, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, GripVertical, X } from "lucide-react";
import toast from "react-hot-toast";

interface Category { id: string; name: string; sort_order: number; }
interface MenuItem {
  id: string; category_id: string | null; name: string; description: string | null;
  price: number; item_type: "drink" | "food" | "other"; is_available: boolean;
  order_count: number; image_url: string | null;
}

const TYPE_OPTIONS = [
  { value: "drink", label: "Drink", color: "teal" },
  { value: "food", label: "Food", color: "amber" },
  { value: "other", label: "Other", color: "muted" },
] as const;

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<"items" | "categories">("items");

  // item form state
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "", description: "", price: "",
    item_type: "drink" as "drink" | "food" | "other",
    category_id: "", image_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // category form state
  const [showCatForm, setShowCatForm] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");

  function load() {
    api.get("/menu/categories").then((r) => setCategories(r.data)).catch(() => {});
    api.get("/menu/items").then((r) => setItems(r.data)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  // ── Item actions ───────────────────────────────────────

  function openAddItem() {
    setEditItem(null);
    setItemForm({ name: "", description: "", price: "", item_type: "drink", category_id: "", image_url: "" });
    setShowItemForm(true);
    setShowCatForm(false);
  }

  function openEditItem(item: MenuItem) {
    setEditItem(item);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      item_type: item.item_type,
      category_id: item.category_id ?? "",
      image_url: item.image_url ?? "",
    });
    setShowItemForm(true);
    setShowCatForm(false);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/menu/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setItemForm((f) => ({ ...f, image_url: r.data.url }));
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed — max 5 MB, JPEG/PNG/WebP only");
    } finally {
      setUploading(false);
    }
  }

  async function saveItem() {
    const body = {
      name: itemForm.name,
      description: itemForm.description || null,
      price: parseFloat(itemForm.price),
      item_type: itemForm.item_type,
      category_id: itemForm.category_id || null,
      image_url: itemForm.image_url || null,
    };
    try {
      if (editItem) {
        await api.patch(`/menu/items/${editItem.id}`, body);
        toast.success("Item updated");
      } else {
        await api.post("/menu/items", body);
        toast.success("Item added to menu");
      }
      setShowItemForm(false);
      load();
    } catch { toast.error("Save failed"); }
  }

  async function toggleAvailability(item: MenuItem) {
    await api.patch(`/menu/items/${item.id}/availability`);
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Remove this item from the menu?")) return;
    await api.delete(`/menu/items/${id}`);
    load();
  }

  // ── Category actions ───────────────────────────────────

  function openAddCat() {
    setEditCat(null);
    setCatName("");
    setShowCatForm(true);
    setShowItemForm(false);
  }

  function openEditCat(cat: Category) {
    setEditCat(cat);
    setCatName(cat.name);
    setShowCatForm(true);
    setShowItemForm(false);
  }

  async function saveCat() {
    if (!catName.trim()) return;
    try {
      if (editCat) {
        await api.patch(`/menu/categories/${editCat.id}`, { name: catName.trim() });
        toast.success("Category renamed");
      } else {
        await api.post("/menu/categories", {
          name: catName.trim(),
          sort_order: categories.length + 1,
        });
        toast.success("Category created");
      }
      setShowCatForm(false);
      load();
    } catch { toast.error("Save failed"); }
  }

  async function deleteCat(id: string) {
    const count = items.filter((i) => i.category_id === id).length;
    if (count > 0) {
      toast.error(`Move or delete the ${count} item${count !== 1 ? "s" : ""} in this category first`);
      return;
    }
    if (!confirm("Delete this category?")) return;
    await api.delete(`/menu/categories/${id}`);
    load();
  }

  const categorisedItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  const uncategorised = items.filter((i) => !i.category_id);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Menu</h1>
          <p className="text-muted text-sm mt-1">
            {items.length} items · {categories.length} categories
          </p>
        </div>
        <div className="flex gap-3">
          {activeTab === "categories" ? (
            <button onClick={openAddCat} className="btn-teal flex items-center gap-2">
              <Plus size={16} /> New Category
            </button>
          ) : (
            <button onClick={openAddItem} className="btn-teal flex items-center gap-2">
              <Plus size={16} /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-6">
        {(["items", "categories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setShowItemForm(false); setShowCatForm(false); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === t ? "bg-teal/10 text-teal" : "text-muted hover:text-text"
            }`}
          >
            {t === "items" ? `Menu Items (${items.length})` : `Categories (${categories.length})`}
          </button>
        ))}
      </div>

      {/* ── Item form ── */}
      {showItemForm && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">
            {editItem ? `Edit: ${editItem.name}` : "New Menu Item"}
          </h3>

          {/* Type selector */}
          <div>
            <label className="block text-text-soft text-sm mb-2">Type</label>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setItemForm((f) => ({ ...f, item_type: opt.value }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                    itemForm.item_type === opt.value
                      ? opt.color === "teal"
                        ? "bg-teal/10 text-teal border-teal/30"
                        : opt.color === "amber"
                        ? "bg-amber/10 text-amber border-amber/30"
                        : "bg-bg-hover text-text border-border"
                      : "border-border text-muted hover:text-text"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">Item name *</label>
              <input
                className="input"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={
                  itemForm.item_type === "drink"
                    ? "e.g. Hennessy VS, Tequila Shot, Mojito"
                    : itemForm.item_type === "food"
                    ? "e.g. Truffle Fries, Beef Suya"
                    : "e.g. Hookah Set, Table Service"
                }
                autoFocus
              />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Price (₦) *</label>
              <input
                className="input"
                type="number"
                value={itemForm.price}
                onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="e.g. 2500"
              />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Category</label>
              <select
                className="input"
                value={itemForm.category_id}
                onChange={(e) => setItemForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">— No category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">Description <span className="text-muted">(optional)</span></label>
              <input
                className="input"
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown to customers"
              />
            </div>

            {/* Image upload */}
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">
                Photo <span className="text-muted">(optional — shown to customers on the menu)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImage(file);
                  e.target.value = "";
                }}
              />
              {itemForm.image_url ? (
                <div className="relative w-40 h-28 rounded-xl overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={itemForm.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded-lg bg-white/20 text-white text-xs"
                    >
                      <Camera size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemForm((f) => ({ ...f, image_url: "" }))}
                      className="p-1.5 rounded-lg bg-white/20 text-white text-xs"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-3 px-4 py-5 rounded-xl border-2 border-dashed w-full text-left transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,212,180,0.35)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                >
                  {uploading ? (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse" style={{ background: "rgba(0,212,180,0.1)" }}>
                      <Camera size={16} style={{ color: "var(--teal)" }} />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,212,180,0.08)", border: "1px solid rgba(0,212,180,0.2)" }}>
                      <Camera size={16} style={{ color: "var(--teal)" }} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-soft)" }}>
                      {uploading ? "Uploading…" : "Upload photo"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      JPEG, PNG or WebP · max 5 MB
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveItem}
              disabled={!itemForm.name || !itemForm.price}
              className="btn-teal"
            >
              {editItem ? "Save Changes" : "Add to Menu"}
            </button>
            <button onClick={() => setShowItemForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Category form ── */}
      {showCatForm && (
        <div className="card mb-6">
          <h3 className="font-display font-semibold text-text mb-4">
            {editCat ? `Rename: ${editCat.name}` : "New Category"}
          </h3>
          <div className="flex gap-3">
            <input
              className="input flex-1"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Shots & Shooters, Non-Alcoholic, VIP Menu"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveCat()}
            />
            <button onClick={saveCat} disabled={!catName.trim()} className="btn-teal">
              {editCat ? "Rename" : "Create"}
            </button>
            <button onClick={() => setShowCatForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Items view ── */}
      {activeTab === "items" && (
        <div className="space-y-6">
          {categorisedItems.map((cat) => (
            cat.items.length > 0 && (
              <div key={cat.id}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="font-display font-semibold text-text">{cat.name}</h2>
                  <span className="badge-muted">{cat.items.length}</span>
                </div>
                <div className="card overflow-hidden p-0">
                  <table className="w-full text-sm">
                    <tbody>
                      {cat.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`${idx > 0 ? "border-t border-border" : ""} hover:bg-bg-hover/40`}
                        >
                          <td className="px-4 py-3 w-8">
                            <GripVertical size={14} className="text-muted/40" />
                          </td>
                          <td className="px-3 py-2.5 w-12">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-10 h-10 rounded-lg object-cover"
                                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                              >
                                {item.item_type === "drink" ? "🍸" : item.item_type === "food" ? "🍽️" : "✨"}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-text font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-muted text-xs mt-0.5">{item.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge-${item.item_type === "drink" ? "teal" : item.item_type === "food" ? "amber" : "muted"}`}>
                              {item.item_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text font-semibold tabular-nums">
                            {formatNGN(item.price)}
                          </td>
                          <td className="px-4 py-3 text-muted text-xs">
                            {item.order_count > 0 ? `${item.order_count} orders` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleAvailability(item)}
                              title={item.is_available ? "Mark unavailable" : "Mark available"}
                            >
                              {item.is_available
                                ? <ToggleRight size={22} className="text-teal" />
                                : <ToggleLeft size={22} className="text-muted" />}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => openEditItem(item)} className="p-1.5 text-muted hover:text-teal rounded-lg transition-colors">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteItem(item.id)} className="p-1.5 text-muted hover:text-red-400 rounded-lg transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ))}

          {/* Uncategorised */}
          {uncategorised.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-display font-semibold text-muted">Uncategorised</h2>
                <span className="badge-muted">{uncategorised.length}</span>
              </div>
              <div className="card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {uncategorised.map((item, idx) => (
                      <tr key={item.id} className={`${idx > 0 ? "border-t border-border" : ""} hover:bg-bg-hover/40`}>
                        <td className="px-4 py-3 w-8">
                          <GripVertical size={14} className="text-muted/40" />
                        </td>
                        <td className="px-3 py-2.5 w-12">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover"
                              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                              {item.item_type === "drink" ? "🍸" : item.item_type === "food" ? "🍽️" : "✨"}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-text font-medium">{item.name}</p>
                          {item.description && <p className="text-muted text-xs mt-0.5">{item.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge-${item.item_type === "drink" ? "teal" : item.item_type === "food" ? "amber" : "muted"}`}>
                            {item.item_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text font-semibold tabular-nums">{formatNGN(item.price)}</td>
                        <td className="px-4 py-3 text-muted text-xs">{item.order_count > 0 ? `${item.order_count} orders` : "—"}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleAvailability(item)}>
                            {item.is_available ? <ToggleRight size={22} className="text-teal" /> : <ToggleLeft size={22} className="text-muted" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEditItem(item)} className="p-1.5 text-muted hover:text-teal rounded-lg transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => deleteItem(item.id)} className="p-1.5 text-muted hover:text-red-400 rounded-lg transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-muted">No menu items yet.</p>
              <button onClick={openAddItem} className="btn-teal mt-4">Add your first item</button>
            </div>
          )}
        </div>
      )}

      {/* ── Categories view ── */}
      {activeTab === "categories" && (
        <div className="space-y-3">
          {categories.map((cat) => {
            const count = items.filter((i) => i.category_id === cat.id).length;
            return (
              <div key={cat.id} className="card flex items-center justify-between">
                <div>
                  <p className="text-text font-medium">{cat.name}</p>
                  <p className="text-muted text-xs mt-0.5">{count} item{count !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEditCat(cat)} className="p-2 text-muted hover:text-teal rounded-lg transition-colors">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => deleteCat(cat.id)} className="p-2 text-muted hover:text-red-400 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-muted">No categories yet.</p>
              <button onClick={openAddCat} className="btn-teal mt-4">Create first category</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
