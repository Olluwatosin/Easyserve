"use client";

/**
 * The owner's data, on its way out of here.
 *
 * An accountant wants last month, payroll is worked out from hours, and every
 * so often a bank or a landlord wants figures nobody is going to read off a
 * dashboard. None of that should mean asking us for a database dump.
 *
 * Ranges are nights, not dates. The 30th means the night that opened on the
 * 30th, including the small hours of the 1st — the same boundary the rest of
 * the system uses, so this file and the dashboard agree. Picking "September"
 * by calendar date would cut the last night in half and quietly disagree with
 * both the till and the owner's memory of it.
 *
 * Every download reports how many rows it contained, because an empty file and
 * a failed request look identical in a downloads folder.
 */

import { useMemo, useState } from "react";
import {
  Boxes, Clock, CreditCard, Download, ReceiptText, ShoppingBag,
} from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

/** Today's *night*, which before 6AM is still yesterday. */
function tonight(): Date {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const PRESETS = [
  {
    key: "this-month",
    label: "This month",
    range: () => {
      const t = tonight();
      return [iso(monthStart(t)), iso(t)];
    },
  },
  {
    key: "last-month",
    label: "Last month",
    range: () => {
      const t = tonight();
      const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const last = new Date(t.getFullYear(), t.getMonth(), 0);
      return [iso(first), iso(last)];
    },
  },
  {
    key: "last-7",
    label: "Last 7 nights",
    range: () => {
      const t = tonight();
      const from = new Date(t);
      from.setDate(from.getDate() - 6);
      return [iso(from), iso(t)];
    },
  },
  {
    key: "last-90",
    label: "Last 90 nights",
    range: () => {
      const t = tonight();
      const from = new Date(t);
      from.setDate(from.getDate() - 89);
      return [iso(from), iso(t)];
    },
  },
] as const;

const DATASETS = [
  {
    key: "orders",
    label: "Orders",
    icon: ShoppingBag,
    blurb:
      "One row a bill: table, attendant, what it came to, and how it was paid.",
    note: "The sales figure. This is the one an accountant asks for.",
  },
  {
    key: "items",
    label: "Items sold",
    icon: ReceiptText,
    blurb: "Every line on every bill — what actually moved, and at what price.",
    note: "What a menu gets rewritten from.",
  },
  {
    key: "payments",
    label: "Payments",
    icon: CreditCard,
    blurb:
      "Cash, transfers and card, with references. Split bills appear as separate legs.",
    note: "What you reconcile against the bank and the cash box.",
  },
  {
    key: "shifts",
    label: "Hours worked",
    icon: Clock,
    blurb: "Clock-in, clock-out and hours for each person, night by night.",
    note: "Payroll. Shifts nobody closed show no hours rather than a guess.",
  },
  {
    key: "stock",
    label: "Stock movements",
    icon: Boxes,
    blurb: "Everything in and out, with the balance after and who moved it.",
    note: "How a shortage gets traced to a night instead of argued about.",
  },
] as const;

export default function ReportsPage() {
  const initial = PRESETS[0].range();
  const [start, setStart] = useState(initial[0]);
  const [end, setEnd] = useState(initial[1]);
  const [busy, setBusy] = useState<string | null>(null);

  const activePreset = useMemo(() => {
    for (const p of PRESETS) {
      const [s, e] = p.range();
      if (s === start && e === end) return p.key;
    }
    return null;
  }, [start, end]);

  const nights = useMemo(() => {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
    return Math.round((b - a) / 86400_000) + 1;
  }, [start, end]);

  async function download(dataset: string, label: string) {
    if (nights === null) {
      toast.error("That start date is after the end date");
      return;
    }
    setBusy(dataset);
    try {
      const res = await api.get(`/exports/${dataset}.csv`, {
        params: { start, end },
        responseType: "blob",
        // A long range is a lot of rows, and the shared 15s default would cut
        // the request off mid-download and read as a failure.
        timeout: 120_000,
      });

      // Prefer the name the server chose — it carries the venue and the range,
      // which is what makes a folder of these files navigable.
      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename="([^"]+)"/);
      const name = match?.[1] ?? `${dataset}-${start}_to_${end}.csv`;

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // An empty file and a failed request look the same in a downloads folder,
      // so the count is said out loud.
      const rows = Number(res.headers["x-row-count"] ?? NaN);
      if (rows === 0) {
        toast(`No ${label.toLowerCase()} in that range — the file is empty`);
      } else if (Number.isFinite(rows)) {
        toast.success(`${label} — ${rows.toLocaleString()} rows downloaded`);
      } else {
        toast.success(`${label} downloaded`);
      }
    } catch (err: unknown) {
      // The server refuses ranges over about a year; say which it was.
      const detail =
        (err as { response?: { status?: number } })?.response?.status === 400
          ? "That range is too long — try a year or less"
          : `Could not export ${label.toLowerCase()}`;
      toast.error(detail);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text)" }}>
          Reports
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Your records as spreadsheets. Pick the nights, then take what you need.
        </p>
      </div>

      {/* ── The range ── */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => {
            const on = activePreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => {
                  const [s, e] = p.range();
                  setStart(s);
                  setEnd(e);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  color: on ? "var(--teal)" : "var(--muted)",
                  background: on ? "rgba(0,212,180,0.08)" : "transparent",
                  border: `1px solid ${on ? "rgba(0,212,180,0.25)" : "var(--border)"}`,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              First night
            </span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="input"
              style={{ colorScheme: "dark", width: 168 }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Last night
            </span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="input"
              style={{ colorScheme: "dark", width: 168 }}
            />
          </label>
          <p className="text-xs pb-2" style={{ color: "var(--muted)" }}>
            {nights === null
              ? "That start is after the end"
              : `${nights} night${nights === 1 ? "" : "s"} — a night runs 6PM to 6AM, so the small hours count towards the night before.`}
          </p>
        </div>
      </div>

      {/* ── What there is to take ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {DATASETS.map(({ key, label, icon: Icon, blurb, note }) => (
          <div key={key} className="card flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Icon size={18} style={{ color: "var(--teal)", flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <p className="font-semibold" style={{ color: "var(--text)" }}>
                  {label}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {blurb}
                </p>
              </div>
            </div>
            <p
              className="text-xs italic pl-7"
              style={{ color: "var(--muted)", opacity: 0.75 }}
            >
              {note}
            </p>
            <button
              onClick={() => download(key, label)}
              disabled={busy !== null}
              className="btn-teal mt-auto"
              style={{ opacity: busy !== null ? 0.6 : 1 }}
            >
              <Download size={15} />
              {busy === key ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--muted)" }}>
        Amounts are plain numbers so they add up in a spreadsheet — no naira sign,
        which would turn the column into text. Times are venue time.
      </p>
    </div>
  );
}
