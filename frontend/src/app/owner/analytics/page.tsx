"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PeakHoursChart, TopItemsChart } from "@/components/charts";
import { formatNGN } from "@/lib/utils";
import { Lock } from "lucide-react";

interface PeakHour { hour: number; order_count: number; }
interface TopItem { name: string; order_count: number; revenue: number; }
interface SlowTable { label: string; avg_minutes: number; }
interface StaffScore { full_name: string; avg_minutes: number; orders_handled: number; }
interface FeedbackSummary { avg_rating: number; total_responses: number; }
interface InventoryAlert {
  name: string;
  stock_quantity: number;
  stock_threshold: number;
  is_out: boolean;
}

function PlanGate() {
  return (
    <div className="card flex flex-col items-center justify-center py-12 gap-3 opacity-60">
      <Lock size={28} className="text-muted" />
      <p className="text-muted text-sm">Available on Growth plan and above</p>
      <a href="/owner/settings" className="text-teal text-sm hover:underline">Upgrade plan →</a>
    </div>
  );
}

export default function AnalyticsPage() {
  const [peakHours, setPeakHours] = useState<PeakHour[] | null>(null);
  const [topItems, setTopItems] = useState<TopItem[] | null>(null);
  const [slowTables, setSlowTables] = useState<SlowTable[] | null>(null);
  const [staffScores, setStaffScores] = useState<StaffScore[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [inventory, setInventory] = useState<InventoryAlert[] | null>(null);
  const [itemsBy, setItemsBy] = useState<"revenue" | "order_count">("revenue");
  const [planError, setPlanError] = useState(false);

  useEffect(() => {
    api.get("/analytics/slow-tables").then((r) => setSlowTables(r.data)).catch(() => {});
    api.get("/analytics/feedback").then((r) => setFeedback(r.data)).catch(() => {});
    api.get("/analytics/inventory").then((r) => setInventory(r.data)).catch(() => {});

    // Plan-gated
    api.get("/analytics/peak-hours").then((r) => setPeakHours(r.data)).catch(() => setPlanError(true));
    api.get("/analytics/top-items").then((r) => setTopItems(r.data)).catch(() => {});
    api.get("/analytics/staff-scores").then((r) => setStaffScores(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text">Analytics</h1>
        <p className="text-muted text-sm mt-1">Insights to optimise your venue</p>
      </div>

      <div className="space-y-8">
        {/* Feedback */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Customer Feedback</h2>
          {feedback ? (
            <div className="card flex items-center gap-8">
              <div>
                <p className="font-display text-5xl font-bold text-amber">
                  {feedback.avg_rating ? feedback.avg_rating.toFixed(1) : "—"}
                </p>
                <p className="text-muted text-sm">avg rating</p>
              </div>
              <div>
                <p className="font-display text-3xl font-bold text-text">{feedback.total_responses}</p>
                <p className="text-muted text-sm">responses</p>
              </div>
            </div>
          ) : <div className="card animate-pulse h-24" />}
        </section>

        {/* Peak Hours */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Peak Hours</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Orders by hour, last 7 days
          </p>
          {planError ? <PlanGate /> : peakHours ? (
            <div className="card">
              <PeakHoursChart data={peakHours} />
            </div>
          ) : <div className="card animate-pulse h-56" />}
        </section>

        {/* Top Items */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Top Menu Items</h2>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* One bottle can out-earn a whole night of beer, which flattens
                every other bar to a few pixels. Revenue answers "what makes
                money", quantity answers "what actually moves" — both are real
                questions and neither is a substitute for the other. */}
            {(["revenue", "order_count"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setItemsBy(k)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{
                  background: itemsBy === k ? "rgba(0,212,180,0.16)" : "transparent",
                  border: `1px solid ${itemsBy === k ? "rgba(0,212,180,0.45)" : "rgba(255,255,255,0.10)"}`,
                  color: itemsBy === k ? "var(--teal)" : "var(--muted)",
                }}
              >
                {k === "revenue" ? "By revenue" : "By quantity sold"}
              </button>
            ))}
          </div>
          {planError ? <PlanGate /> : topItems ? (
            <div className="card space-y-4">
              <TopItemsChart
                data={[...topItems].sort((a, b) => b[itemsBy] - a[itemsBy])}
                valueKey={itemsBy}
                formatValue={(v) =>
                  itemsBy === "revenue" ? formatNGN(v) : String(v)
                }
              />
              <details>
                <summary
                  className="text-xs cursor-pointer"
                  style={{ color: "var(--muted)" }}
                >
                  Show as a table
                </summary>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm" style={{ minWidth: 340 }}>
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        {["Item", "Sold", "Revenue"].map((h) => (
                          <th
                            key={h}
                            className={`pb-2 font-medium ${h === "Item" ? "text-left" : "text-right"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.slice(0, 8).map((item) => (
                        <tr key={item.name} style={{ borderTop: "1px solid #1E2D42" }}>
                          <td className="py-2" style={{ color: "var(--text-soft)" }}>
                            {item.name}
                          </td>
                          <td className="py-2 text-right tabular-nums" style={{ color: "var(--muted)" }}>
                            {item.order_count}
                          </td>
                          <td className="py-2 text-right tabular-nums" style={{ color: "var(--text)" }}>
                            {formatNGN(item.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ) : <div className="card animate-pulse h-56" />}
        </section>

        {/* Slow Tables */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Slow Tables</h2>
          {slowTables ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {slowTables.map((t) => (
                <div key={t.label} className="card">
                  <p className="font-display font-bold text-text">{t.label}</p>
                  <p className="text-amber font-semibold text-xl mt-1">{t.avg_minutes.toFixed(0)} min</p>
                  <p className="text-muted text-xs">avg fulfillment</p>
                </div>
              ))}
            </div>
          ) : <div className="card animate-pulse h-24" />}
        </section>

        {/* Staff Scores */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Staff Performance</h2>
          {planError ? <PlanGate /> : staffScores ? (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-bg-hover">
                  <tr>
                    {["Staff Member", "Orders Handled", "Avg Fulfillment"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-muted font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffScores.map((s, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3 text-text font-medium">{s.full_name}</td>
                      <td className="px-4 py-3 text-muted">{s.orders_handled}</td>
                      <td className="px-4 py-3 text-text">{s.avg_minutes.toFixed(0)} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="card animate-pulse h-32" />}
        </section>

        {/* Inventory Alerts */}
        {inventory && inventory.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-semibold text-text mb-4">High-Volume Items</h2>
            <div className="space-y-2">
              {inventory.map((item) => (
                <div key={item.name} className="card flex items-center justify-between">
                  <p className="text-text font-medium">{item.name}</p>
                  <span className={item.is_out ? "badge-muted" : "badge-amber"}>
                    {item.is_out ? "Out of stock" : `${item.stock_quantity} left`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
