"use client";

/**
 * The sheet you put on the wall before doors open.
 *
 * Everything a manager needed at 8pm was spread across three screens and a
 * chat message: who is on tonight, which station they sign in at, whether their
 * PIN even works, which tables they cover, and the link to sign in. The first
 * question of every shift — "who has VIP tonight?" — had no single place to
 * look, and the question that ended this evening — "why is my PIN invalid?" —
 * could not be answered from any screen at all.
 *
 * So: one page, printable, that answers all of it without a login.
 *
 * Deliberately outside /owner, like the QR sheet: that layout wraps children in
 * an `h-screen overflow-hidden` shell with a sidebar, which clips a printout to
 * a single screen.
 *
 * PINs are never on this sheet. It is meant to be stuck on a wall, and a wall
 * is not where credentials go — it carries whether a PIN is *set*, which is the
 * thing a manager actually needs to know before service.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer, AlertTriangle } from "lucide-react";

import { api } from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  zone: string | null;
  is_active: boolean;
  has_pin: boolean;
}

interface Table {
  id: string;
  label: string;
  zone: string | null;
  is_active: boolean;
  attendant_ids: string[];
  assigned_attendant_id: string | null;
}

const STATION: Record<string, string> = {
  bartender: "Bar display",
  kitchen: "Kitchen tickets",
  cashier: "Payments & exit passes",
  attendant: "Floor & alerts",
  security: "Exit scanner",
  owner: "Owner dashboard",
};

function ShiftSheet() {
  const router = useRouter();
  const [venue, setVenue] = useState<{ name: string; slug: string } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/venues/me").then((r) => setVenue(r.data)).catch(() => {}),
      api.get("/staff").then((r) => setStaff(r.data)).catch(() => {}),
      api.get("/tables").then((r) => setTables(r.data)).catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  const signInLink =
    typeof window === "undefined" || !venue
      ? ""
      : `${window.location.origin}/pin-login?venue=${encodeURIComponent(venue.slug)}`;

  const activeStaff = useMemo(
    () => staff.filter((s) => s.is_active),
    [staff],
  );

  /** Which tables each person covers, by id. */
  const tablesFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const t of tables) {
      if (!t.is_active) continue;
      const ids = t.attendant_ids?.length
        ? t.attendant_ids
        : t.assigned_attendant_id
          ? [t.assigned_attendant_id]
          : [];
      for (const id of ids) (map[id] ??= []).push(t.label);
    }
    return map;
  }, [tables]);

  /** Tables grouped by the zone they sit in, in the order the floor runs. */
  const byZone = useMemo(() => {
    const groups: Record<string, Table[]> = {};
    for (const t of tables) {
      if (!t.is_active) continue;
      (groups[t.zone || "Unzoned"] ??= []).push(t);
    }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staff) m[s.id] = s.full_name;
    return m;
  }, [staff]);

  const uncovered = useMemo(
    () =>
      tables.filter(
        (t) => t.is_active && !(t.attendant_ids?.length || t.assigned_attendant_id),
      ),
    [tables],
  );
  const pinless = activeStaff.filter((s) => !s.has_pin);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="shift-root">
      <style>{`
        .shift-root { background: #fff; color: #111; min-height: 100vh; }
        .sheet { max-width: 190mm; margin: 0 auto; padding: 14mm 12mm; }
        .shift-root h1, .shift-root h2 { margin: 0; }
        .rule { border: 0; border-top: 1px solid #d8d8d8; margin: 0; }
        table.grid { width: 100%; border-collapse: collapse; }
        table.grid th, table.grid td {
          text-align: left; padding: 7px 8px; border-bottom: 1px solid #e6e6e6;
          font-size: 12px; vertical-align: top;
        }
        table.grid th {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
          color: #666; border-bottom: 1.5px solid #bbb; font-weight: 600;
        }
        .warn { background: #fff6e5; border: 1px solid #f0c27a; border-radius: 6px; }
        .chip {
          display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 999px;
          border: 1px solid #ccc; margin: 0 4px 4px 0; white-space: nowrap;
        }
        .chip-none { border-color: #e0a33e; color: #9a6100; background: #fff6e5; }
        @media print {
          .no-print { display: none !important; }
          .sheet { padding: 0; max-width: none; }
          .zone-block { break-inside: avoid; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>

      <div className="no-print" style={{ borderBottom: "1px solid #e5e5e5", background: "#fafafa" }}>
        <div className="sheet" style={{ padding: "10px 12mm", display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => router.push("/owner/staff")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#444" }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => window.print()}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
              background: "#111", color: "#fff", border: 0, borderRadius: 7, padding: "8px 14px",
            }}
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {venue?.name ?? "Shift sheet"}
            </h1>
            <p style={{ fontSize: 13, color: "#555", marginTop: 3 }}>
              Shift sheet · {today}
            </p>
          </div>
          {signInLink && (
            <div style={{ textAlign: "center" }}>
              <QRCodeSVG value={signInLink} size={74} level="M" />
              <p style={{ fontSize: 9.5, color: "#666", marginTop: 4, maxWidth: 90, lineHeight: 1.3 }}>
                Scan to sign in
              </p>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: "#555", margin: "10px 0 14px" }}>
          Staff sign in at <strong>{signInLink.replace(/^https?:\/\//, "") || "…"}</strong> and
          enter their own 4-digit PIN. PINs are not printed here — ask your
          manager if you have forgotten yours, and they will set a new one.
        </p>

        {loaded && (pinless.length > 0 || uncovered.length > 0) && (
          <div className="warn" style={{ padding: "9px 11px", margin: "0 0 14px" }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} /> Before doors open
            </p>
            <ul style={{ fontSize: 11.5, margin: "5px 0 0 16px", lineHeight: 1.55 }}>
              {pinless.length > 0 && (
                <li>
                  <strong>{pinless.map((s) => s.full_name).join(", ")}</strong>{" "}
                  {pinless.length === 1 ? "has" : "have"} no PIN set and cannot
                  sign in at a station yet.
                </li>
              )}
              {uncovered.length > 0 && (
                <li>
                  <strong>{uncovered.length}</strong>{" "}
                  {uncovered.length === 1 ? "table has" : "tables have"} no
                  attendant: {uncovered.map((t) => t.label).join(", ")}.
                </li>
              )}
            </ul>
          </div>
        )}

        <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "#666", margin: "0 0 6px" }}>
          On tonight
        </h2>
        <table className="grid" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th style={{ width: "27%" }}>Name</th>
              <th style={{ width: "17%" }}>Role</th>
              <th style={{ width: "22%" }}>Station</th>
              <th>Tables</th>
              <th style={{ width: "9%" }}>PIN</th>
            </tr>
          </thead>
          <tbody>
            {activeStaff.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                <td style={{ textTransform: "capitalize" }}>{s.role}</td>
                <td style={{ color: "#555" }}>{STATION[s.role] ?? "—"}</td>
                <td>
                  {s.role === "attendant" ? (
                    tablesFor[s.id]?.length ? (
                      tablesFor[s.id]
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                        .map((l) => <span key={l} className="chip">{l}</span>)
                    ) : (
                      <span className="chip chip-none">none assigned</span>
                    )
                  ) : (
                    <span style={{ color: "#999" }}>{s.zone || "—"}</span>
                  )}
                </td>
                <td style={{ color: s.has_pin ? "#1a7f4b" : "#9a6100", fontWeight: 600 }}>
                  {s.has_pin ? "Set" : "Not set"}
                </td>
              </tr>
            ))}
            {loaded && activeStaff.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "#888", padding: "14px 8px" }}>
                  No active staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "#666", margin: "0 0 6px" }}>
          Floor map — who covers what
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px 20px" }}>
          {byZone.map(([zone, list]) => (
            <div key={zone} className="zone-block">
              <p style={{ fontSize: 12.5, fontWeight: 700, margin: "6px 0 3px" }}>{zone}</p>
              <hr className="rule" />
              {list.map((t) => {
                const ids = t.attendant_ids?.length
                  ? t.attendant_ids
                  : t.assigned_attendant_id
                    ? [t.assigned_attendant_id]
                    : [];
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex", justifyContent: "space-between", gap: 8,
                      fontSize: 11.5, padding: "3.5px 0", borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    <span style={{ color: ids.length ? "#333" : "#9a6100", textAlign: "right" }}>
                      {ids.length
                        ? ids.map((id) => nameOf[id] ?? "—").join(", ")
                        : "no attendant"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {loaded && tables.length === 0 && (
          <p style={{ fontSize: 12, color: "#888" }}>No tables yet.</p>
        )}
      </div>
    </div>
  );
}

export default function ShiftSheetPage() {
  return (
    <AuthGuard allowedRoles={["owner"]}>
      <ShiftSheet />
    </AuthGuard>
  );
}
