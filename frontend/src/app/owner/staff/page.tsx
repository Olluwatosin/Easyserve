"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { KeyRound, Link as LinkIcon, MessageCircle, Plus, UserCheck, UserX, X } from "lucide-react";
import toast from "react-hot-toast";

const ROLES = ["attendant", "bartender", "kitchen", "cashier", "security"] as const;
type StaffRole = typeof ROLES[number];

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  zone: string | null;
  is_active: boolean;
  /** Whether a keypad PIN exists. Never the PIN itself — it cannot be read back. */
  has_pin: boolean;
}

const ROLE_COLORS: Record<StaffRole, string> = {
  attendant: "badge-teal",
  bartender: "badge-amber",
  kitchen: "badge-amber",
  cashier: "badge-muted",
  security: "badge-red",
};

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

/**
 * Set a PIN, then hand it to the person it belongs to.
 *
 * A PIN is stored hashed and cannot be read back — so the moment just after
 * setting one is the only moment anybody can see it. Closing the dialog there,
 * as this used to, meant a forgotten PIN read on the floor as a broken login
 * with nothing to explain it.
 *
 * The message is composed here, in the browser, and opens in the owner's own
 * WhatsApp. The PIN was typed on this screen, so it never travels to our
 * servers in the clear and never lands in a log.
 */
function PinModal({
  member,
  venueSlug,
  presetPin,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  venueSlug: string;
  presetPin?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pin, setPin] = useState(presetPin ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(presetPin));

  function press(key: string) {
    if (key === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length < 4) setPin((p) => p + key);
  }

  async function save() {
    if (pin.length !== 4) return;
    setSaving(true);
    try {
      await api.patch(`/staff/${member.id}/pin`, { pin });
      setSaved(true);
      onSaved();
    } catch {
      toast.error("Failed to set PIN");
    } finally {
      setSaving(false);
    }
  }

  const signInLink =
    typeof window === "undefined"
      ? ""
      : venueSlug
        ? `${window.location.origin}/pin-login?venue=${encodeURIComponent(venueSlug)}`
        : `${window.location.origin}/pin-login`;

  function sendOnWhatsApp() {
    const firstName = member.full_name.split(" ")[0];
    const text =
      `Hi ${firstName} — here is your EasyServe sign-in.\n\n` +
      `Open: ${signInLink}\n` +
      `Your PIN: ${pin}\n\n` +
      `Keep this to yourself. If you forget it, ask me and I'll set a new one.`;
    // With a number we open that chat directly; without one WhatsApp asks the
    // owner to pick the contact.
    const to = member.phone ? member.phone.replace(/\D/g, "") : "";
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  function copyPin() {
    navigator.clipboard.writeText(pin);
    toast.success("PIN copied");
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
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
              {saved ? "Send it to them" : member.has_pin ? "Change PIN" : "Set PIN"}
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{member.full_name}</p>
          </div>
        </div>

        {saved ? (
          <div className="space-y-4">
            <div
              className="rounded-xl px-4 py-4 text-center"
              style={{
                background: "rgba(0,212,180,0.07)",
                border: "1px solid rgba(0,212,180,0.25)",
              }}
            >
              <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                {member.full_name.split(" ")[0]}&rsquo;s PIN
              </p>
              <p
                className="font-bold tabular-nums"
                style={{ fontSize: "30px", letterSpacing: "0.28em", color: "var(--teal)" }}
              >
                {pin}
              </p>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              This is the only time it can be shown. PINs are stored scrambled, so
              nobody — not even you — can look one up later. If it&rsquo;s
              forgotten, just set a new one.
            </p>

            <button onClick={sendOnWhatsApp} className="btn-teal w-full">
              <MessageCircle size={14} />
              {member.phone ? "Send on WhatsApp" : "Send on WhatsApp…"}
            </button>

            <div className="flex gap-2">
              <button
                onClick={copyPin}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: "1px solid rgba(255,255,255,0.14)", color: "var(--text-soft)" }}
              >
                Copy PIN
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: "1px solid rgba(255,255,255,0.14)", color: "var(--text-soft)" }}
              >
                Done
              </button>
            </div>

            {!member.phone && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                No phone number saved for {member.full_name.split(" ")[0]}, so
                WhatsApp will ask you to pick the contact.
              </p>
            )}
          </div>
        ) : (
        <>
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

        <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
          You&rsquo;ll be able to send this to {member.full_name.split(" ")[0]} on
          the next screen. It can&rsquo;t be looked up afterwards — only replaced.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [venueSlug, setVenueSlug] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pinTarget, setPinTarget] = useState<
    { member: StaffMember; presetPin?: string } | null
  >(null);
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "attendant" as StaffRole,
    zone: "", phone: "", pin: "",
  });

  function load() { api.get("/staff").then((r) => setStaff(r.data)).catch(() => {}); }
  useEffect(() => {
    api
      .get("/venues/me")
      .then((r) => setVenueSlug(r.data?.slug ?? ""))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, []);

  async function createStaff() {
    try {
      const created = await api.post("/staff", {
        ...form,
        zone: form.zone || null,
        phone: form.phone || null,
      });
      toast.success("Staff member added");
      setShowForm(false);
      // Straight to the hand-off: this is the only moment the PIN can be shown.
      setPinTarget({ member: created.data, presetPin: form.pin });
      setForm({
        full_name: "", email: "", password: "", role: "attendant",
        zone: "", phone: "", pin: "",
      });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to add staff";
      toast.error(msg);
    }
  }

  async function reactivate(id: string) {
    try {
      await api.patch(`/staff/${id}/reactivate`);
      toast.success("Reactivated — set a new PIN if the old one should not work");
      load();
    } catch {
      toast.error("Could not reactivate");
    }
  }

  function copySignInLink() {
    if (!venueSlug) return;
    const link = `${window.location.origin}/pin-login?venue=${encodeURIComponent(venueSlug)}`;
    navigator.clipboard.writeText(link);
    toast.success("Sign-in link copied");
  }

  function shareOnWhatsApp() {
    if (!venueSlug) return;
    const link = `${window.location.origin}/pin-login?venue=${encodeURIComponent(venueSlug)}`;
    const text = `Your EasyServe sign-in link:\n${link}\n\nOpen it on your phone and enter the 4-digit PIN I gave you.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function deactivate(id: string) {
    await api.delete(`/staff/${id}`);
    toast("Staff member deactivated");
    load();
  }

  return (
    <div>
      {pinTarget && (
        <PinModal
          member={pinTarget.member}
          venueSlug={venueSlug}
          presetPin={pinTarget.presetPin}
          onClose={() => setPinTarget(null)}
          onSaved={load}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Staff</h1>
          <p className="text-muted text-sm mt-1">{staff.filter((s) => s.is_active).length} active members</p>
        </div>

      <div
        className="card mb-6 flex flex-wrap items-center gap-3"
        style={{ background: "rgba(0,212,180,0.05)", border: "1px solid rgba(0,212,180,0.2)" }}
      >
        <LinkIcon size={16} style={{ color: "var(--teal)", flexShrink: 0 }} />
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Staff sign-in link
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Send this to your team. It opens straight to the keypad — no venue
            name to type. The link is the same for everyone; only the PIN is
            personal, so send that one to each person directly, never to a group.
          </p>
        </div>
        <button onClick={shareOnWhatsApp} className="btn-teal px-4 text-sm">
          <MessageCircle size={14} /> WhatsApp
        </button>
        <button
          onClick={copySignInLink}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ border: "1px solid rgba(255,255,255,0.14)", color: "var(--text-soft)" }}
        >
          Copy link
        </button>
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
              { key: "phone", label: "WhatsApp number (optional)", type: "tel", placeholder: "0801 234 5678" },
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
            <div>
              <label className="block text-text-soft text-sm mb-1.5">4-digit PIN</label>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="e.g. 4821"
                value={form.pin}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                }
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            The PIN is how they sign in at the station — without one they can&rsquo;t,
            so it&rsquo;s set here rather than later. You&rsquo;ll get a chance to send
            it to them straight after.
          </p>
          <div className="flex gap-3">
            <button
              onClick={createStaff}
              disabled={
                !form.full_name || !form.email || !form.password || form.pin.length !== 4
              }
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
                    <div className="flex items-center gap-2">
                      {/* A missing PIN reads as a wrong PIN at the keypad, with
                          nothing on the station explaining it. Say so here. */}
                      {!member.has_pin && (
                        <span
                          className="badge-amber"
                          title={`${member.full_name} cannot sign in at a station until a PIN is set`}
                        >
                          No PIN
                        </span>
                      )}
                      <button
                        onClick={() => setPinTarget({ member })}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: "rgba(0,212,180,0.08)",
                          border: "1px solid rgba(0,212,180,0.15)",
                          color: "var(--teal)",
                        }}
                      >
                        <KeyRound size={11} />
                        {member.has_pin ? "Change" : "Set PIN"}
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {member.is_active ? (
                    <button
                      onClick={() => deactivate(member.id)}
                      title="Deactivate"
                      className="p-1.5 text-muted hover:text-red-400"
                    >
                      <UserX size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivate(member.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{
                        background: "rgba(0,212,180,0.08)",
                        border: "1px solid rgba(0,212,180,0.15)",
                        color: "var(--teal)",
                      }}
                    >
                      <UserCheck size={11} />
                      Reactivate
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
