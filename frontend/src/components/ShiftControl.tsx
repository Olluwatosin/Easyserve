"use client";

/**
 * Clocking on and off, from the screen someone already has open.
 *
 * It sits in the station header rather than behind a menu, because it is the
 * first thing done on arrival and the last thing on the way out — and anything
 * that takes hunting for at 4am simply does not get done, which turns into a
 * shift the owner has to reconstruct.
 *
 * Starting asks for the venue's code. That is the point of it: signing in
 * proves somebody knows a PIN, and the code is on the wall at work. Ending
 * needs nothing — nobody clocks a colleague *out* to their advantage, and
 * putting friction on the way out is how shifts get left open.
 *
 * The elapsed time ticks while it is on screen, because a number that has to be
 * worked out from a start time is one nobody checks.
 */

import { useEffect, useState } from "react";
import { LogIn, LogOut, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

function elapsed(since: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

export function ShiftControl({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<{ on: boolean; since?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  function load() {
    api
      .get("/shifts/me")
      .then((r) => setState({ on: r.data.on_shift, since: r.data.started_at }))
      .catch(() => setState({ on: false }));
  }

  useEffect(load, []);

  // Re-render each minute so the running time is the time, not the time it was
  // when the screen opened.
  useEffect(() => {
    if (!state?.on) return;
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [state?.on]);

  async function clockIn() {
    if (code.trim().length < 3) return;
    setBusy(true);
    try {
      await api.post("/shifts/clock-in", { code: code.trim() });
      toast.success("Clocked in — have a good night");
      setAsking(false);
      setCode("");
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Could not clock in";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    setBusy(true);
    try {
      const { data } = await api.post("/shifts/clock-out");
      const worked = elapsed(data.started_at);
      toast.success(`Clocked out — ${worked}`);
      load();
    } catch {
      toast.error("Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  return (
    <>
      {state.on ? (
        <button
          onClick={clockOut}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "rgba(0,212,180,0.1)",
            border: "1px solid rgba(0,212,180,0.3)",
            color: "var(--teal)",
          }}
          title="End your shift"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--teal)", boxShadow: "0 0 6px var(--teal)" }}
          />
          {state.since && !compact && <span className="tabular-nums">{elapsed(state.since)}</span>}
          <LogOut size={12} />
        </button>
      ) : (
        <button
          onClick={() => setAsking(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid #1E2D42",
            color: "var(--muted)",
          }}
        >
          <LogIn size={12} /> {compact ? "Clock in" : "Start shift"}
        </button>
      )}

      {asking && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setAsking(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-6"
            style={{ background: "#0E1820", border: "1px solid #1E2D42" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <p className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
                Start your shift
              </p>
              <button onClick={() => setAsking(false)} style={{ color: "var(--muted)" }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
              Enter the code on the sheet behind the bar.
            </p>

            <input
              className="input text-center"
              style={{ fontSize: 26, letterSpacing: "0.3em", height: 56, fontWeight: 700 }}
              value={code}
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              maxLength={8}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && clockIn()}
              placeholder="-----"
            />

            <button
              onClick={clockIn}
              disabled={busy || code.trim().length < 3}
              className="btn-teal w-full mt-4"
              style={{ height: 48 }}
            >
              {busy ? "Starting…" : "Clock in"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
