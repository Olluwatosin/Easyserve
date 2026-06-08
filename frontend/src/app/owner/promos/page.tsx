"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Tag } from "lucide-react";
import toast from "react-hot-toast";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

interface Promo {
  id: string;
  name: string;
  discount_pct: number;
  start_time: string;
  end_time: string;
  days_active: string[];
  is_active: boolean;
}

export default function PromosPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", discount_pct: "", start_time: "20:00", end_time: "23:00", days_active: [] as string[] });

  function load() { api.get("/promos").then((r) => setPromos(r.data)).catch(() => {}); }
  useEffect(() => { load(); }, []);

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      days_active: f.days_active.includes(day) ? f.days_active.filter((d) => d !== day) : [...f.days_active, day],
    }));
  }

  async function createPromo() {
    try {
      await api.post("/promos", { name: form.name, discount_pct: parseFloat(form.discount_pct), start_time: form.start_time, end_time: form.end_time, days_active: form.days_active });
      toast.success("Promo created");
      setShowForm(false);
      setForm({ name: "", discount_pct: "", start_time: "20:00", end_time: "23:00", days_active: [] });
      load();
    } catch { toast.error("Failed to create promo"); }
  }

  async function deletePromo(id: string) {
    await api.delete(`/promos/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Promos</h1>
          <p className="text-muted text-sm mt-1">Time-based discount promotions</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-teal flex items-center gap-2">
          <Plus size={16} /> New Promo
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">New Promotion</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-text-soft text-sm mb-1.5">Promo Name *</label>
              <input className="input" placeholder="Happy Hour" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Discount % *</label>
              <input className="input" type="number" min="1" max="100" placeholder="20" value={form.discount_pct} onChange={(e) => setForm((f) => ({ ...f, discount_pct: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-text-soft text-sm mb-1.5">Start Time</label>
                <input className="input" type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <label className="block text-text-soft text-sm mb-1.5">End Time</label>
                <input className="input" type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-text-soft text-sm mb-2">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button key={day} onClick={() => toggleDay(day)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${form.days_active.includes(day) ? "bg-teal/10 text-teal border border-teal/30" : "bg-bg-hover text-muted border border-transparent"}`}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={createPromo} disabled={!form.name || !form.discount_pct} className="btn-teal">Create</button>
            <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {promos.length === 0 ? (
        <div className="card text-center py-16">
          <Tag size={40} className="mx-auto mb-3 text-muted opacity-40" />
          <p className="text-muted">No promos yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map((promo) => (
            <div key={promo.id} className="card flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-text">{promo.name}</p>
                  <span className="badge-teal">{promo.discount_pct}% off</span>
                  {!promo.is_active && <span className="badge-muted">Inactive</span>}
                </div>
                <p className="text-muted text-xs mt-1">
                  {promo.start_time} – {promo.end_time}
                  {promo.days_active?.length > 0 && ` · ${promo.days_active.map((d) => d.slice(0, 3)).join(", ")}`}
                </p>
              </div>
              <button onClick={() => deletePromo(promo.id)} className="p-2 text-muted hover:text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
