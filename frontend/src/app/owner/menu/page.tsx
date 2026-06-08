"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import toast from "react-hot-toast";

interface Category { id: string; name: string; sort_order: number; }
interface MenuItem {
  id: string; category_id: string | null; name: string; description: string | null;
  price: number; item_type: "drink" | "food" | "other"; is_available: boolean;
  order_count: number;
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<"items" | "categories">("items");
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", item_type: "drink" as "drink" | "food" | "other", category_id: "" });

  function load() {
    api.get("/menu/categories").then((r) => setCategories(r.data)).catch(() => {});
    api.get("/menu/items").then((r) => setItems(r.data)).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setEditItem(null); setForm({ name: "", description: "", price: "", item_type: "drink", category_id: "" }); setShowItemForm(true); }
  function openEdit(item: MenuItem) {
    setEditItem(item);
    setForm({ name: item.name, description: item.description ?? "", price: String(item.price), item_type: item.item_type, category_id: item.category_id ?? "" });
    setShowItemForm(true);
  }

  async function saveItem() {
    const body = { name: form.name, description: form.description || null, price: parseFloat(form.price), item_type: form.item_type, category_id: form.category_id || null };
    try {
      if (editItem) {
        await api.patch(`/menu/items/${editItem.id}`, body);
        toast.success("Item updated");
      } else {
        await api.post("/menu/items", body);
        toast.success("Item added");
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
    await api.delete(`/menu/items/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Menu</h1>
          <p className="text-muted text-sm mt-1">{items.length} items across {categories.length} categories</p>
        </div>
        <button onClick={openAdd} className="btn-teal flex items-center gap-2">
          <Plus size={16} /> Add Item
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["items", "categories"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === t ? "bg-teal/10 text-teal" : "text-muted hover:text-text"}`}>
            {t === "items" ? "Menu Items" : "Categories"}
          </button>
        ))}
      </div>

      {/* Item form */}
      {showItemForm && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">{editItem ? "Edit Item" : "New Item"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Hennessy VS" />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Price (₦) *</label>
              <input className="input" type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="5000" />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Type</label>
              <select className="input" value={form.item_type} onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value as "drink" | "food" | "other" }))}>
                <option value="drink">Drink</option>
                <option value="food">Food</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Category</label>
              <select className="input" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
                <option value="">— None —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">Description</label>
              <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveItem} disabled={!form.name || !form.price} className="btn-teal">Save</button>
            <button onClick={() => setShowItemForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {/* Items table */}
      {activeTab === "items" && (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-bg-hover">
              <tr>
                {["Name", "Type", "Price", "Category", "Orders", "Available", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-muted font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-bg-hover/50">
                  <td className="px-4 py-3 text-text font-medium">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${item.item_type === "drink" ? "teal" : item.item_type === "food" ? "amber" : "muted"}`}>
                      {item.item_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text">{formatNGN(item.price)}</td>
                  <td className="px-4 py-3 text-muted">{categories.find((c) => c.id === item.category_id)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{item.order_count}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleAvailability(item)} className={item.is_available ? "text-teal" : "text-muted"}>
                      {item.is_available ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-muted hover:text-teal"><Edit2 size={14} /></button>
                      <button onClick={() => deleteItem(item.id)} className="p-1.5 text-muted hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Categories */}
      {activeTab === "categories" && (
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.id} className="card flex items-center justify-between">
              <p className="text-text font-medium">{cat.name}</p>
              <p className="text-muted text-sm">{items.filter((i) => i.category_id === cat.id).length} items</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
