"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, UserX } from "lucide-react";
import toast from "react-hot-toast";

const ROLES = ["attendant", "bartender", "kitchen", "cashier", "security"] as const;
type StaffRole = typeof ROLES[number];

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  zone: string | null;
  is_active: boolean;
}

const ROLE_COLORS: Record<StaffRole, string> = {
  attendant: "badge-teal",
  bartender: "badge-amber",
  kitchen: "badge-amber",
  cashier: "badge-muted",
  security: "badge-red",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "attendant" as StaffRole, zone: "" });

  function load() { api.get("/staff").then((r) => setStaff(r.data)).catch(() => {}); }
  useEffect(() => { load(); }, []);

  async function createStaff() {
    try {
      await api.post("/staff", { ...form, zone: form.zone || null });
      toast.success("Staff member added");
      setShowForm(false);
      setForm({ full_name: "", email: "", password: "", role: "attendant", zone: "" });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to add staff";
      toast.error(msg);
    }
  }

  async function deactivate(id: string) {
    await api.delete(`/staff/${id}`);
    toast("Staff member deactivated");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Staff</h1>
          <p className="text-muted text-sm mt-1">{staff.filter((s) => s.is_active).length} active members</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-teal flex items-center gap-2">
          <Plus size={16} /> Add Staff
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">New Staff Member</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "full_name", label: "Full Name", type: "text", placeholder: "Jane Doe" },
              { key: "email", label: "Email", type: "email", placeholder: "jane@venue.com" },
              { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
              { key: "zone", label: "Zone (optional)", type: "text", placeholder: "VIP" },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="block text-text-soft text-sm mb-1.5">{label}</label>
                <input className="input" type={type} placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}>
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={createStaff} disabled={!form.full_name || !form.email || !form.password} className="btn-teal">Add Member</button>
            <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover">
            <tr>
              {["Name", "Email", "Role", "Zone", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-muted font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t border-border hover:bg-bg-hover/50">
                <td className="px-4 py-3 text-text font-medium">{member.full_name}</td>
                <td className="px-4 py-3 text-muted">{member.email}</td>
                <td className="px-4 py-3">
                  <span className={ROLE_COLORS[member.role] ?? "badge-muted"}>{member.role}</span>
                </td>
                <td className="px-4 py-3 text-muted">{member.zone ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={member.is_active ? "badge-teal" : "badge-muted"}>
                    {member.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {member.is_active && (
                    <button onClick={() => deactivate(member.id)} className="p-1.5 text-muted hover:text-red-400">
                      <UserX size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
