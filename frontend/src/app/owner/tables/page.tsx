"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Check, ClipboardList, Copy, Download, Pencil, Plus, Printer, QrCode, Trash2, UserPlus, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { useVenueChannel } from "@/lib/venueChannel";
import { ITEM_STATUS_LABEL, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import { groupOpenByTable, runningFor } from "@/lib/tableLive";

interface StaffUser {
  id: string;
  full_name: string;
  role: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
}

interface Order {
  id: string;
  table_id: string | null;
  status: string;
  grand_total: number;
  items: OrderItem[];
  created_at: string;
}

interface Table {
  id: string;
  label: string;
  qr_token: string;
  capacity: number | null;
  zone: string | null;
  min_spend: number;
  assigned_attendant_id: string | null;
  attendant_ids: string[];
  is_active: boolean;
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [form, setForm] = useState({ label: "", capacity: "", zone: "", minSpend: "" });
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [detail, setDetail] = useState<Table | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);

  function loadOrders() {
    api.get("/orders").then((r) => setOrders(r.data)).catch(() => {});
  }

  function load() {
    api.get("/tables").then((r) => setTables(r.data)).catch(() => {});
    loadOrders();
    api
      .get("/staff")
      .then((r) =>
        setStaff((r.data as StaffUser[]).filter((s) => s.role === "attendant"))
      )
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get("/venues/me").then((r) => setVenueId(r.data?.id ?? null)).catch(() => {});
  }, []);

  // The floor moves while this screen is open, and a stale "owed" figure is
  // worse than none — it is the number someone decides to let a table leave on.
  useVenueChannel(venueId, { onOrders: loadOrders });

  /** What is actually running on each table right now. Shared with the
      attendant's floor view so the two can never disagree about what a table
      owes. */
  const liveByTable = useMemo(() => groupOpenByTable(orders), [orders]);

  /** Tables nobody is covering. The first question before doors open, and
      until now it could only be answered by reading every card. */
  const uncovered = useMemo(
    () => tables.filter((t) => !(t.attendant_ids?.length || t.assigned_attendant_id)),
    [tables],
  );

  /** Grouped the way the floor is actually laid out, so the screen reads like
      the room rather than like a list. */
  const byZone = useMemo(() => {
    const groups: Record<string, Table[]> = {};
    for (const t of tables) (groups[t.zone || "Unzoned"] ??= []).push(t);
    for (const list of Object.values(groups)) {
      list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  function customerUrl(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/table/${token}`;
  }

  async function createTable() {
    try {
      await api.post("/tables", {
        label: form.label,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        zone: form.zone || null,
        min_spend: form.minSpend ? parseFloat(form.minSpend) : 0,
      });
      toast.success("Table created");
      setShowAdd(false);
      setForm({ label: "", capacity: "", zone: "", minSpend: "" });
      load();
    } catch {
      toast.error("Failed to create table");
    }
  }

  /** Rename / re-zone an existing table.

      Tables were nameable only at creation, so a venue stuck with whatever was
      typed on setup day — and the labels staff actually use on the floor drift
      from those within a week. */
  async function saveEdit() {
    if (!editTable) return;
    try {
      await api.patch(`/tables/${editTable.id}`, {
        label: editTable.label,
        capacity: editTable.capacity,
        zone: editTable.zone || null,
        min_spend: Number(editTable.min_spend) || 0,
      });
      toast.success("Table updated");
      setEditTable(null);
      load();
    } catch {
      toast.error("Could not update table");
    }
  }

  async function deactivate(id: string) {
    await api.delete(`/tables/${id}`);
    load();
  }

  async function setAttendants(tableId: string, ids: string[]) {
    await api.patch(`/tables/${tableId}/assign-multi`, { attendant_ids: ids });
    load();
  }

  function toggleAttendant(table: Table, staffId: string) {
    const current = table.attendant_ids ?? [];
    const next = current.includes(staffId)
      ? current.filter((id) => id !== staffId)
      : [...current, staffId];
    setAttendants(table.id, next);
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(customerUrl(token));
    toast.success("Link copied!");
  }

  function downloadQR(label: string) {
    const svg = document.getElementById("qr-svg-export");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${label.toLowerCase().replace(/\s+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Tables</h1>
          <p className="text-muted text-sm mt-1">
            {tables.length} tables
            {uncovered.length > 0 ? (
              <>
                {" · "}
                <span style={{ color: "var(--amber)" }}>
                  {uncovered.length} with no attendant
                </span>
              </>
            ) : (
              " · every table has an attendant"
            )}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <a
              href="/print/shift"
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--teal)" }}
            >
              <ClipboardList size={13} /> Shift sheet
            </a>
            <a
              href="/print/tables"
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--teal)" }}
            >
              <Printer size={13} /> Print all QR codes
            </a>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-teal flex items-center gap-2">
          <Plus size={16} /> Add Table
        </button>
      </div>

      {showAdd && (
        <div className="card mb-6 space-y-4">
          <h3 className="font-display font-semibold text-text">New Table</h3>
          <p className="text-muted text-sm">Name it anything — Table 1, A1, Rooftop, VIP Booth, Garden 3...</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Name *</label>
              <input
                className="input"
                placeholder="e.g. Table 1, VIP A, B2"
                value={form.label}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && form.label && createTable()}
              />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Capacity</label>
              <input
                className="input"
                type="number"
                placeholder="4"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Zone / Section</label>
              <input
                className="input"
                placeholder="e.g. VIP, Outdoor, Bar"
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-text-soft text-sm mb-1.5">Minimum Spend (₦)</label>
              <input
                className="input"
                type="number"
                placeholder="0 — for VIP / bottle-service tables"
                value={form.minSpend}
                onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={createTable} disabled={!form.label} className="btn-teal">
              Create Table
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {byZone.map(([zone, zoneTables]) => (
        <section key={zone} className="mb-8">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-display text-lg font-semibold" style={{ color: "var(--text)" }}>
              {zone}
            </h2>
            <span className="text-muted text-xs">
              {zoneTables.length} {zoneTables.length === 1 ? "table" : "tables"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {zoneTables.map((table) => (
          <div key={table.id} className="card">
            {/* ── Card header ── */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-display font-bold text-text text-lg">{table.label}</p>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  {/* The state that matters most on this screen, said on the
                      card rather than inferred from an empty chip row below. */}
                  {!(table.attendant_ids?.length || table.assigned_attendant_id) && (
                    <span className="badge-amber">No attendant</span>
                  )}
                  {table.capacity && (
                    <span className="text-muted text-xs self-center">Seats {table.capacity}</span>
                  )}
                  {Number(table.min_spend) > 0 && (
                    <span
                      className="text-xs self-center font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,149,0,0.1)", color: "var(--amber)" }}
                      title="Minimum spend"
                    >
                      Min ₦{Number(table.min_spend).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditTable({ ...table })}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--teal)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                  title="Rename or re-zone"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setQrTable(table)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--teal)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                  title="Show customer QR"
                >
                  <QrCode size={16} />
                </button>
                <button
                  onClick={() => deactivate(table.id)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                  title="Remove table"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* ── What is running here right now ── */}
            {(() => {
              const live = liveByTable[table.id];
              const open = live?.open.length ?? 0;
              return (
                <button
                  onClick={() => setDetail(table)}
                  className="w-full flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl text-left transition-colors"
                  style={{
                    background: open ? "rgba(255,179,71,0.07)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${open ? "rgba(255,179,71,0.22)" : "rgba(255,255,255,0.07)"}`,
                  }}
                >
                  {open ? (
                    <>
                      <span className="text-xs" style={{ color: "var(--text-soft)" }}>
                        {open} open {open === 1 ? "order" : "orders"} · {runningFor(live!.since)}
                      </span>
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: "var(--amber)" }}
                      >
                        ₦{live!.owed.toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        Nothing running
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        View
                      </span>
                    </>
                  )}
                </button>
              );
            })()}

            {/* ── Mini QR preview ── */}
            <div
              className="flex items-center gap-3 mb-4 p-2.5 rounded-xl cursor-pointer"
              style={{ background: "rgba(0,212,180,0.04)", border: "1px solid rgba(0,212,180,0.12)" }}
              onClick={() => setQrTable(table)}
            >
              <QRCodeSVG
                value={customerUrl(table.qr_token)}
                size={40}
                bgColor="transparent"
                fgColor="#00D4B4"
                level="M"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: "var(--teal)" }}>
                  Customer QR
                </p>
                <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  Scan to browse menu & order
                </p>
              </div>
            </div>

            {/* ── Attendant multi-select ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <UserPlus size={13} style={{ color: "var(--muted)" }} />
                <label className="text-muted text-xs font-medium">
                  Assigned Attendants
                  {(table.attendant_ids?.length ?? 0) > 0 && (
                    <span className="ml-1.5 text-teal">
                      ({table.attendant_ids?.length})
                    </span>
                  )}
                </label>
              </div>
              {staff.length === 0 ? (
                <p className="text-muted text-xs">No attendants added yet</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.map((s) => {
                    const selected = table.attendant_ids?.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleAttendant(table, s.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: selected ? "rgba(0,212,180,0.12)" : "rgba(255,255,255,0.04)",
                          border: selected ? "1px solid rgba(0,212,180,0.35)" : "1px solid #1E2D42",
                          color: selected ? "var(--teal)" : "var(--muted)",
                        }}
                      >
                        {selected && <Check size={11} />}
                        {s.full_name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
          </div>
        </section>
      ))}

      {/* ── One table, whole story ── */}
      {detail && (() => {
        const live = liveByTable[detail.id];
        const names = (detail.attendant_ids ?? [])
          .map((id) => staff.find((x) => x.id === id)?.full_name)
          .filter(Boolean) as string[];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setDetail(null)}
          >
            <div
              className="w-full max-w-md rounded-3xl p-7 animate-fade-in max-h-[85vh] overflow-y-auto"
              style={{
                background: "#0E1820",
                border: "1px solid #1E2D42",
                boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="font-display font-bold text-xl" style={{ color: "var(--text)" }}>
                    {detail.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {[detail.zone, detail.capacity ? `${detail.capacity} seats` : null]
                      .filter(Boolean)
                      .join(" · ") || "No zone set"}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} style={{ color: "var(--muted)" }}>
                  <X size={16} />
                </button>
              </div>

              <div className="mb-5">
                <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                  Attendant
                </p>
                <p className="text-sm" style={{ color: names.length ? "var(--text)" : "var(--amber)" }}>
                  {names.length ? names.join(", ") : "Nobody assigned"}
                </p>
              </div>

              {live?.open.length ? (
                <>
                  <div
                    className="flex items-center justify-between rounded-xl px-4 py-3 mb-4"
                    style={{
                      background: "rgba(255,179,71,0.08)",
                      border: "1px solid rgba(255,179,71,0.25)",
                    }}
                  >
                    <div>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        Owed
                      </p>
                      <p
                        className="font-display font-bold text-2xl tabular-nums"
                        style={{ color: "var(--amber)" }}
                      >
                        ₦{live.owed.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        Running
                      </p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {runningFor(live.since)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {live.open.map((o) => (
                      <div
                        key={o.id}
                        className="rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2D42" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="text-xs font-semibold"
                            style={{ color: ORDER_STATUS_COLOR[o.status] ?? "var(--muted)" }}
                          >
                            {ORDER_STATUS_LABEL[o.status] ?? o.status}
                          </span>
                          <span
                            className="text-xs tabular-nums"
                            style={{ color: "var(--text-soft)" }}
                          >
                            ₦{Number(o.grand_total).toLocaleString()}
                          </span>
                        </div>
                        {o.items.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between text-xs py-0.5"
                          >
                            <span style={{ color: "var(--text-soft)" }}>
                              {it.quantity}× {it.name}
                            </span>
                            <span style={{ color: "var(--muted)" }}>
                              {ITEM_STATUS_LABEL[it.status] ?? it.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  className="rounded-xl px-4 py-6 text-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2D42" }}
                >
                  <p className="text-sm" style={{ color: "var(--text-soft)" }}>
                    Nothing running on this table
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    No unpaid orders — it is clear for the next guests.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setQrTable(detail); setDetail(null); }}
                  className="btn-outline flex-1"
                >
                  Show QR
                </button>
                <button
                  onClick={() => { setEditTable({ ...detail }); setDetail(null); }}
                  className="btn-outline flex-1"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit table ── */}
      {editTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setEditTable(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-7 animate-fade-in"
            style={{
              background: "#0E1820",
              border: "1px solid #1E2D42",
              boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <p className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
                Edit table
              </p>
              <button onClick={() => setEditTable(null)} style={{ color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-text-soft text-sm mb-1.5">Name</label>
                <input
                  className="input"
                  autoFocus
                  value={editTable.label}
                  onChange={(e) =>
                    setEditTable((t) => (t ? { ...t, label: e.target.value } : t))
                  }
                  onKeyDown={(e) => e.key === "Enter" && editTable.label && saveEdit()}
                />
                <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  Use whatever staff call it on the floor. The QR code keeps
                  working — renaming does not reprint anything.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-text-soft text-sm mb-1.5">Zone</label>
                  <input
                    className="input"
                    placeholder="VIP, Terrace…"
                    value={editTable.zone ?? ""}
                    onChange={(e) =>
                      setEditTable((t) => (t ? { ...t, zone: e.target.value } : t))
                    }
                  />
                </div>
                <div>
                  <label className="block text-text-soft text-sm mb-1.5">Seats</label>
                  <input
                    className="input"
                    type="number"
                    value={editTable.capacity ?? ""}
                    onChange={(e) =>
                      setEditTable((t) =>
                        t ? { ...t, capacity: e.target.value ? parseInt(e.target.value) : null } : t,
                      )
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-text-soft text-sm mb-1.5">Minimum spend (₦)</label>
                <input
                  className="input"
                  type="number"
                  value={String(editTable.min_spend ?? 0)}
                  onChange={(e) =>
                    setEditTable((t) => (t ? { ...t, min_spend: Number(e.target.value) } : t))
                  }
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={saveEdit} disabled={!editTable.label} className="btn-teal flex-1">
                Save
              </button>
              <button onClick={() => setEditTable(null)} className="btn-outline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Modal ── */}
      {qrTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setQrTable(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-7 animate-fade-in"
            style={{
              background: "#0E1820",
              border: "1px solid #1E2D42",
              boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
                  {qrTable.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Customer QR Code{qrTable.zone ? ` · ${qrTable.zone}` : ""}
                </p>
              </div>
              <button
                onClick={() => setQrTable(null)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="flex flex-col items-center p-6 rounded-2xl mb-5 animate-glow-teal"
              style={{ background: "#1A2535", border: "1px solid rgba(0,212,180,0.25)" }}
            >
              <QRCodeSVG
                id="qr-svg-export"
                value={customerUrl(qrTable.qr_token)}
                size={200}
                bgColor="#1A2535"
                fgColor="#00D4B4"
                level="M"
              />
              <p className="text-xs text-center mt-4" style={{ color: "var(--muted)" }}>
                Customers scan this to view the menu, place orders & see their bill
              </p>
            </div>

            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p
                className="text-xs truncate flex-1"
                style={{ color: "var(--muted)", fontFamily: "monospace" }}
              >
                {customerUrl(qrTable.qr_token)}
              </p>
              <button onClick={() => copyLink(qrTable.qr_token)} className="flex-shrink-0">
                <Copy size={13} style={{ color: "var(--teal)" }} />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => copyLink(qrTable.qr_token)}
                className="btn-outline flex-1 flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Copy size={14} /> Copy Link
              </button>
              <button
                onClick={() => downloadQR(qrTable.label)}
                className="btn-teal flex-1 flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Download size={14} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
