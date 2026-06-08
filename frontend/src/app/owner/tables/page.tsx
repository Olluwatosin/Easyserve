"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { QrCode, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import toast from "react-hot-toast";

interface StaffUser {
  id: string;
  full_name: string;
  role: string;
}

interface Table {
  id: string;
  label: string;
  qr_token: string;
  capacity: number | null;
  zone: string | null;
  assigned_attendant_id: string | null;
  is_active: boolean;
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: "", capacity: "", zone: "" });

  function load() {
    api.get("/tables").then((r) => setTables(r.data)).catch(() => {});
    api.get("/staff").then((r) => setStaff((r.data as StaffUser[]).filter((s) => s.role === "attendant"))).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function createTable() {
    try {
      await api.post("/tables", {
        label: form.label,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        zone: form.zone || null,
      });
      toast.success("Table created");
      setShowAdd(false);
      setForm({ label: "", capacity: "", zone: "" });
      load();
    } catch {
      toast.error("Failed to create table");
    }
  }

  async function deactivate(id: string) {
    await api.delete(`/tables/${id}`);
    load();
  }

  async function assignAttendant(tableId: string, attendantId: string) {
    if (attendantId === "") {
      await api.patch(`/tables/${tableId}/unassign`);
    } else {
      await api.patch(`/tables/${tableId}/assign`, { attendant_id: attendantId });
    }
    load();
  }

  async function downloadQR(tableId: string, label: string) {
    const res = await api.get(`/tables/${tableId}/qr`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${label}-qr.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Tables</h1>
          <p className="text-muted text-sm mt-1">{tables.length} tables · assign attendants, download QR codes</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-teal flex items-center gap-2">
          <Plus size={16} /> Add Table
        </button>
      </div>

      {showAdd && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">New Table</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Label *</label>
              <input className="input" placeholder="Table 1" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Capacity</label>
              <input className="input" type="number" placeholder="4" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Zone</label>
              <input className="input" placeholder="VIP" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={createTable} disabled={!form.label} className="btn-teal">Create</button>
            <button onClick={() => setShowAdd(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((table) => (
          <div key={table.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-display font-bold text-text text-lg">{table.label}</p>
                {table.zone && <p className="text-muted text-xs">{table.zone}</p>}
                {table.capacity && <p className="text-muted text-xs">Cap: {table.capacity}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => downloadQR(table.id, table.label)} className="p-2 text-muted hover:text-teal">
                  <QrCode size={16} />
                </button>
                <button onClick={() => deactivate(table.id)} className="p-2 text-muted hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-muted text-xs mb-1.5">Assigned Attendant</label>
              <select
                className="input text-sm"
                value={table.assigned_attendant_id ?? ""}
                onChange={(e) => assignAttendant(table.id, e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
