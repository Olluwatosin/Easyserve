"use client";

/**
 * Hours worked, and the code staff clock in with.
 *
 * This is read to pay people, so it is built to be argued with. Shifts nobody
 * closed are separated out and excluded from the totals rather than guessed at,
 * corrected shifts say so and show what the clock originally said, and every
 * total says which shifts it is not counting.
 *
 * Pay is deliberately not calculated. Rates, overtime and deductions differ by
 * venue and carry real exposure; accurate hours are the useful, defensible
 * thing to hand over.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Copy, KeyRound, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

interface Shift {
  id: string;
  started_at: string;
  ended_at: string | null;
  hours: number | null;
  night: string;
  flagged_unclosed: boolean;
  ended_by: string | null;
  corrected: boolean;
  original_times: { started_at: string | null; ended_at: string | null } | null;
  note: string | null;
}

interface Person {
  user_id: string;
  name: string;
  role: string;
  hours: number;
  unresolved: number;
  shifts: Shift[];
}

interface Sheet {
  people: Person[];
  total_hours: number;
  unresolved_shifts: number;
}

const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "14", label: "Last 14 days" },
  { key: "30", label: "Last 30 days" },
] as const;

function clock(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimesheetPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [days, setDays] = useState<string>("7");
  const [open, setOpen] = useState<string | null>(null);
  const [fixing, setFixing] = useState<Shift | null>(null);

  const load = useCallback(() => {
    const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
    api
      .get<Sheet>("/shifts/timesheet", { params: { since } })
      .then((r) => setSheet(r.data))
      .catch(() => toast.error("Could not load the timesheet"));
  }, [days]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get("/shifts/code").then((r) => setCode(r.data.code)).catch(() => {});
  }, []);

  async function rotate() {
    try {
      const { data } = await api.post("/shifts/code/rotate");
      setCode(data.code);
      toast.success("New code issued — update the sheet behind the bar");
    } catch {
      toast.error("Could not change the code");
    }
  }

  const unresolved = sheet?.unresolved_shifts ?? 0;

  return (
    <div>
      {fixing && (
        <FixShift shift={fixing} onClose={() => setFixing(null)} onSaved={() => { setFixing(null); load(); }} />
      )}

      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text)" }}>
          Hours
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          What each person worked. Pay is yours to calculate — this is the hours.
        </p>
      </div>

      {/* ── The code staff clock in with ── */}
      <div
        className="card mb-6 flex flex-wrap items-center gap-4"
        style={{ background: "rgba(0,212,180,0.05)", border: "1px solid rgba(0,212,180,0.2)" }}
      >
        <KeyRound size={16} style={{ color: "var(--teal)", flexShrink: 0 }} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Clock-in code
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Staff need this to start a shift, so it has to be somewhere only
            people at the venue can read — the printed shift sheet carries it.
          </p>
        </div>
        <span
          className="font-display font-bold tabular-nums px-4 py-2 rounded-xl"
          style={{
            fontSize: 24,
            letterSpacing: "0.2em",
            color: "var(--teal)",
            background: "rgba(0,212,180,0.08)",
            border: "1px solid rgba(0,212,180,0.25)",
          }}
        >
          {code ?? "…"}
        </span>
        <button
          onClick={() => {
            if (code) navigator.clipboard.writeText(code);
            toast.success("Code copied");
          }}
          className="p-2 rounded-lg"
          style={{ color: "var(--muted)" }}
          title="Copy"
        >
          <Copy size={15} />
        </button>
        <button
          onClick={rotate}
          className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5"
          style={{ border: "1px solid rgba(255,255,255,0.14)", color: "var(--text-soft)" }}
          title="Issue a new code"
        >
          <RefreshCw size={13} /> New code
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setDays(r.key)}
            className="px-3 py-2 rounded-lg text-xs font-medium"
            style={{
              background: days === r.key ? "rgba(0,212,180,0.13)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${days === r.key ? "rgba(0,212,180,0.38)" : "#1E2D42"}`,
              color: days === r.key ? "var(--teal)" : "var(--muted)",
            }}
          >
            {r.label}
          </button>
        ))}
        <span className="flex-1" />
        {sheet && (
          <span className="text-sm" style={{ color: "var(--text-soft)" }}>
            <strong style={{ color: "var(--text)" }}>{sheet.total_hours}</strong> hours total
          </span>
        )}
      </div>

      {unresolved > 0 && (
        <div
          className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5 text-sm"
          style={{ background: "rgba(255,179,71,0.07)", border: "1px solid rgba(255,179,71,0.3)" }}
        >
          <AlertTriangle size={15} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
          <span style={{ color: "var(--text-soft)" }}>
            <strong style={{ color: "var(--amber)" }}>
              {unresolved} shift{unresolved === 1 ? "" : "s"} nobody clocked out of.
            </strong>{" "}
            Those hours are not in the total above — nothing is guessed. Open the
            person and set the time they actually left.
          </span>
        </div>
      )}

      <div className="space-y-3">
        {sheet?.people.map((p) => (
          <div key={p.user_id} className="card p-0 overflow-hidden">
            <button
              onClick={() => setOpen(open === p.user_id ? null : p.user_id)}
              className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                  {p.name}
                </p>
                <p className="text-xs capitalize" style={{ color: "var(--muted)" }}>
                  {p.role} · {p.shifts.length} shift{p.shifts.length === 1 ? "" : "s"}
                  {p.unresolved > 0 && (
                    <span style={{ color: "var(--amber)" }}> · {p.unresolved} unresolved</span>
                  )}
                </p>
              </div>
              <span
                className="font-display font-bold text-xl tabular-nums"
                style={{ color: "var(--text)" }}
              >
                {p.hours}
                <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                  {" "}hrs
                </span>
              </span>
            </button>

            {open === p.user_id && (
              <div style={{ borderTop: "1px solid #1E2D42" }}>
                {p.shifts.map((s) => (
                  <div
                    key={s.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                    style={{
                      borderTop: "1px solid rgba(30,45,66,0.5)",
                      background: s.flagged_unclosed ? "rgba(255,179,71,0.05)" : undefined,
                    }}
                  >
                    <div className="min-w-0">
                      <p style={{ color: "var(--text-soft)" }}>
                        {clock(s.started_at)} →{" "}
                        {s.ended_at ? (
                          clock(s.ended_at)
                        ) : (
                          <span style={{ color: "var(--amber)" }}>never clocked out</span>
                        )}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {s.night}
                        {s.corrected && (
                          <span style={{ color: "var(--amber)" }}>
                            {" "}· edited by you
                            {s.original_times?.ended_at === null && " (no clock-out recorded)"}
                          </span>
                        )}
                        {s.note && ` · ${s.note}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className="tabular-nums font-semibold"
                        style={{ color: s.hours == null ? "var(--amber)" : "var(--text)" }}
                      >
                        {s.hours == null ? "—" : `${s.hours}h`}
                      </span>
                      <button
                        onClick={() => setFixing(s)}
                        className="text-xs px-2.5 py-1 rounded-lg"
                        style={{
                          border: "1px solid rgba(0,212,180,0.25)",
                          color: "var(--teal)",
                          background: "rgba(0,212,180,0.07)",
                        }}
                      >
                        {s.ended_at ? "Edit" : "Set end"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {sheet && sheet.people.length === 0 && (
          <div className="card text-center py-10">
            <Clock size={22} style={{ color: "var(--muted)", margin: "0 auto 10px" }} />
            <p className="text-sm" style={{ color: "var(--text)" }}>
              No shifts in this period
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Staff clock in from their own screen using the code above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Correcting times. Keeps what the clock said — see shift_service. */
function FixShift({
  shift,
  onClose,
  onSaved,
}: {
  shift: Shift;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toLocal = (iso: string | null) =>
    iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16) : "";

  const [start, setStart] = useState(toLocal(shift.started_at));
  const [end, setEnd] = useState(toLocal(shift.ended_at));
  const [note, setNote] = useState(shift.note ?? "");
  const [busy, setBusy] = useState(false);

  const hours = useMemo(() => {
    if (!start || !end) return null;
    const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : null;
  }, [start, end]);

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/shifts/${shift.id}`, {
        started_at: start ? new Date(start).toISOString() : null,
        ended_at: end ? new Date(end).toISOString() : null,
        note: note.trim() || null,
      });
      toast.success("Shift updated — the original times are kept");
      onSaved();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Could not update that shift";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6"
        style={{ background: "#0E1820", border: "1px solid #1E2D42" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
              {shift.ended_at ? "Edit shift" : "Set the end time"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {shift.night}
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-text-soft text-sm mb-1.5">Started</label>
            <input
              className="input"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-text-soft text-sm mb-1.5">Ended</label>
            <input
              className="input"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-text-soft text-sm mb-1.5">Why (optional)</label>
            <input
              className="input"
              placeholder="e.g. forgot to clock out"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          {hours != null ? (
            <>
              That is <strong style={{ color: "var(--teal)" }}>{hours} hours</strong>. The
              times the clock recorded are kept alongside this.
            </>
          ) : (
            "Set both times to see the hours."
          )}
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={save} disabled={busy || hours == null} className="btn-teal flex-1">
            <Check size={15} /> {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="btn-outline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
