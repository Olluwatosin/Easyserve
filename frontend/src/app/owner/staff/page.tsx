"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, UserX, KeyRound, X } from "lucide-react";
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

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function PinModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  function press(key: string) {
    if (key === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length < 4) setPin((p) => p + key);
  }

  async function save() {
    if (pin.length !== 4) return;
    setSaving(true);
    try {
      await api.patch(`/staff/${member.id}/pin`, { pin });
      toast.success(`PIN set for ${member.full_name}`);
      onClose();
    } catch {
      toast.error("Failed to set PIN");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xs rounded-2xl p-6 animate-fade-in"
        style={{
          background: "#111827",
          border: "1px solid #1E2D42",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--muted)" }}
        >
          <X size={15} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,212,180,0.1)", border: "1px solid rgba(0,212,180,0.2)" }}
          >
            <KeyRound size={15} className="text-teal" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>Set PIN</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{member.full_name}</p>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full transition-all duration-150"
              style={{
                background: i < pin.length ? "var(--teal)" : "#1E2D42",
                boxShadow: i < pin.length ? "0 0 8px rgba(0,212,180,0.5)" : "none",
                transform: i < pin.length ? "scale(1.2)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Pad */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {PAD_KEYS.map((key, idx) => {
            if (key === "") return <div key={idx} />;
            return (
              <button
                key={idx}
                onClick={() => press(key)}
                className="h-11 rounded-xl flex items-center justify-center font-bold text-lg transition-all active:scale-95"
                style={{
                  background: key === "del" ? "rgba(239,68,68,0.08)" : "#1A2535",
                  border: "1px solid #1E2D42",
                  color: key === "del" ? "#f87171" : "var(--text)",
                  fontSize: key === "del" ? "11px" : undefined,
                }}
              >
                {key === "del" ? "⌫" : key}
              </button>
            );
          })}
        </div>

        <button
          onClick={save}
          disabled={pin.length !== 4 || saving}
          className="btn-teal w-full"
        >
          {saving ? "Saving…" : "Save PIN"}
        </button>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "attendant" as StaffRole, zone: "",
  });

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
      {pinTarget && <PinModal member={pinTarget} onClose={() => setPinTarget(null)} />}

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
              { key: "password", label: "Temp Password", type: "password", placeholder: "••••••••" },
              { key: "zone", label: "Zone (optional)", type: "text", placeholder: "VIP" },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="block text-text-soft text-sm mb-1.5">{label}</label>
                <input
                  className="input"
                  type={type}
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Role</label>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
              >
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            After creating, set a 4-digit PIN so staff can sign in at the station.
          </p>
          <div className="flex gap-3">
            <button
              onClick={createStaff}
              disabled={!form.full_name || !form.email || !form.password}
              className="btn-teal"
            >
              Add Member
            </button>
            <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover">
            <tr>
              {["Name", "Email", "Role", "Zone", "Status", "PIN", ""].map((h) => (
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
                    <button
                      onClick={() => setPinTarget(member)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: "rgba(0,212,180,0.08)",
                        border: "1px solid rgba(0,212,180,0.15)",
                        color: "var(--teal)",
                      }}
                    >
                      <KeyRound size={11} />
                      Set PIN
                    </button>
                  )}
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
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">
                  No staff members yet. Add your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
        style={{ background: "rgba(0,212,180,0.05)", border: "1px solid rgba(0,212,180,0.12)" }}
      >
        <KeyRound size={14} className="text-teal flex-shrink-0" />
        <span style={{ color: "var(--muted)" }}>
          Staff sign in at{" "}
          <a href="/pin-login" className="text-teal hover:underline font-medium" target="_blank">
            /pin-login
          </a>{" "}
          — share that link with your team for their station tablets.
        </span>
      </div>
    </div>
  );
}
