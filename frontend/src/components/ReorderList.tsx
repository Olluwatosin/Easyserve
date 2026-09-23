"use client";

/**
 * What to buy before the next busy night.
 *
 * The low-stock warning this replaces told an owner something was wrong and
 * nothing about what to do, because one number was doing the work of two. A
 * reorder point says *act*; a target level says *how much*. With both, the list
 * is arithmetic anyone can check: you want 120, you have 3, buy 5 crates.
 *
 * Anything derived from trading history stays absent until there is enough of
 * it. A brand-new lounge has sold nothing, and a rate from one night is not a
 * rate — a confident figure from no evidence is worse than no figure, because
 * stock gets ordered against it.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Copy, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";

interface Line {
  item_id: string;
  name: string;
  on_hand: number;
  reorder_at: number;
  par: number | null;
  pack_size: number;
  suggested_packs: number | null;
  suggested_units: number | null;
  unit_cost: number | null;
  line_cost: number | null;
  is_out: boolean;
  sells_per_night: number | null;
  nights_of_cover: number | null;
  nights_counted: number;
}

interface Report {
  lines: Line[];
  count: number;
  out_of_stock: number;
  no_target_set: number;
  estimated_cost: number;
  fully_priced: boolean;
}

export function ReorderList({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Report>("/stock/reorder")
      .then((r) => setReport(r.data))
      .catch(() => toast.error("Could not load the order list"))
      .finally(() => setLoading(false));
  }, []);

  /** The list as a message, because orders get sent to suppliers on WhatsApp. */
  const asText = useMemo(() => {
    if (!report) return "";
    const lines = report.lines
      .filter((l) => l.suggested_units)
      .map((l) =>
        l.pack_size > 1
          ? `${l.name} — ${l.suggested_packs} crate${l.suggested_packs === 1 ? "" : "s"} (${l.suggested_units})`
          : `${l.name} — ${l.suggested_units}`,
      );
    return lines.length ? `Order:\n${lines.join("\n")}` : "";
  }, [report]);

  function copy() {
    navigator.clipboard.writeText(asText);
    toast.success("Order list copied");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: "var(--bg)", borderBottom: "1px solid #1E2D42" }}
      >
        <ClipboardList size={17} style={{ color: "var(--teal)" }} />
        <div className="flex-1">
          <p className="font-display font-bold text-base" style={{ color: "var(--text)" }}>
            What to order
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {report
              ? `${report.count} item${report.count === 1 ? "" : "s"} at or below their reorder point`
              : "…"}
          </p>
        </div>
        {asText && (
          <button onClick={copy} style={{ color: "var(--muted)" }} aria-label="Copy list">
            <Copy size={16} />
          </button>
        )}
        <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {loading && (
          <p className="text-sm text-center py-10" style={{ color: "var(--muted)" }}>
            Working it out…
          </p>
        )}

        {report && report.count === 0 && (
          <div
            className="rounded-2xl px-5 py-10 text-center"
            style={{ background: "rgba(15,25,35,0.58)", border: "1px solid #1E2D42" }}
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              Nothing needs ordering
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Everything is above its reorder point.
            </p>
          </div>
        )}

        {report && report.count > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {report.out_of_stock > 0 && (
                <span
                  className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#f87171",
                  }}
                >
                  <AlertTriangle size={12} /> {report.out_of_stock} out of stock
                </span>
              )}
              {report.no_target_set > 0 && (
                <span
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{
                    background: "rgba(255,179,71,0.1)",
                    border: "1px solid rgba(255,179,71,0.3)",
                    color: "var(--amber)",
                  }}
                >
                  {report.no_target_set} with no target set
                </span>
              )}
            </div>

            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(15,25,35,0.58)", border: "1px solid #1E2D42" }}
            >
              {report.lines.map((l, i) => (
                <div
                  key={l.item_id}
                  className="px-4 py-3"
                  style={{
                    borderTop: i > 0 ? "1px solid #1E2D42" : "none",
                    background: l.is_out ? "rgba(239,68,68,0.05)" : undefined,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {l.name}
                    </p>
                    <p
                      className="text-sm font-bold tabular-nums whitespace-nowrap"
                      style={{ color: l.suggested_units ? "var(--teal)" : "var(--amber)" }}
                    >
                      {l.suggested_units
                        ? l.pack_size > 1
                          ? `${l.suggested_packs} × crate of ${l.pack_size}`
                          : `${l.suggested_units} units`
                        : "set a target"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                    <span style={{ color: l.is_out ? "#f87171" : "var(--muted)" }}>
                      {l.is_out ? "none left" : `${l.on_hand} left`}
                      {l.par != null && ` · want ${l.par}`}
                    </span>
                    {/* Only once there is history behind it. */}
                    {l.nights_of_cover != null && (
                      <span style={{ color: "var(--text-soft)" }}>
                        about {l.nights_of_cover} night
                        {l.nights_of_cover === 1 ? "" : "s"} left at {l.sells_per_night}/night
                      </span>
                    )}
                    {l.line_cost != null && (
                      <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                        {formatNGN(l.line_cost)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="mt-4 rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2D42" }}
            >
              <span className="text-sm" style={{ color: "var(--text-soft)" }}>
                Estimated cost
              </span>
              <span className="text-right">
                <span
                  className="font-display font-bold text-lg tabular-nums"
                  style={{ color: "var(--text)" }}
                >
                  {formatNGN(report.estimated_cost)}
                </span>
                {!report.fully_priced && (
                  <span className="block text-xs" style={{ color: "var(--amber)" }}>
                    some lines have no cost — the real total is higher
                  </span>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
