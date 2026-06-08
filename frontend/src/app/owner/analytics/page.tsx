"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import { Lock } from "lucide-react";

interface PeakHour { hour: number; order_count: number; }
interface TopItem { name: string; order_count: number; revenue: number; }
interface SlowTable { label: string; avg_minutes: number; }
interface StaffScore { full_name: string; avg_minutes: number; orders_handled: number; }
interface FeedbackSummary { avg_rating: number; total_responses: number; }
interface InventoryAlert { name: string; order_count: number; }

function PlanGate({ children }: { children: React.ReactNode }) {
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
          {planError ? <PlanGate /> : peakHours ? (
            <div className="card">
              <div className="flex items-end gap-1.5 h-32">
                {peakHours.map((h) => {
                  const max = Math.max(...peakHours.map((x) => x.order_count), 1);
                  const height = Math.max(4, (h.order_count / max) * 100);
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-teal/30 rounded-sm hover:bg-teal/50 transition-colors"
                        style={{ height: `${height}%` }}
                        title={`${h.order_count} orders`}
                      />
                      <span className="text-muted text-xs">{h.hour}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div className="card animate-pulse h-32" />}
        </section>

        {/* Top Items */}
        <section>
          <h2 className="font-display text-xl font-semibold text-text mb-4">Top Menu Items</h2>
          {planError ? <PlanGate /> : topItems ? (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-bg-hover">
                  <tr>
                    {["Item", "Orders", "Revenue"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-muted font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topItems.slice(0, 10).map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3 text-text font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-muted">{item.order_count}</td>
                      <td className="px-4 py-3 text-teal font-semibold">{formatNGN(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="card animate-pulse h-48" />}
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
                  <span className="badge-amber">{item.order_count} orders today</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
