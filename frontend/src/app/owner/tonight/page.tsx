"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import { TrendingUp, ShoppingBag, Table2, DollarSign, UtensilsCrossed, Wine } from "lucide-react";

interface TonightData {
  today_revenue: number;
  total_orders: number;
  paid_orders: number;
  tables_served: number;
  avg_order_value: number;
  top_items: { name: string; item_type: string; qty: number; revenue: number }[];
}

const ITEM_ICON: Record<string, React.ElementType> = {
  drink: Wine,
  food: UtensilsCrossed,
};

export default function TonightPage() {
  const [data, setData] = useState<TonightData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get("/analytics/tonight")
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-muted text-sm">Could not load tonight&apos;s summary.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40">
        <div
          className="w-7 h-7 border-2 border-teal border-t-transparent rounded-full"
          style={{ animation: "spin-custom 0.7s linear infinite" }}
        />
      </div>
    );
  }

  const maxRev = data.top_items[0]?.revenue ?? 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text)" }}>
          Tonight
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Revenue hero */}
      <div
        className="rounded-2xl p-7"
        style={{
          background: "linear-gradient(135deg, rgba(0,212,180,0.08) 0%, rgba(0,144,107,0.04) 100%)",
          border: "1px solid rgba(0,212,180,0.18)",
          boxShadow: "0 0 48px rgba(0,212,180,0.06)",
        }}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <TrendingUp size={16} className="text-teal" />
          <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            Revenue Today
          </span>
        </div>
        <p
          className="font-display text-5xl font-bold tracking-tight gradient-text"
        >
          {formatNGN(data.today_revenue)}
        </p>
        {data.paid_orders > 0 && (
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            from {data.paid_orders} paid order{data.paid_orders !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Orders", value: data.total_orders, icon: ShoppingBag, color: "#00D4B4" },
          { label: "Tables Served", value: data.tables_served, icon: Table2, color: "#FF9500" },
          { label: "Avg Order", value: formatNGN(data.avg_order_value), icon: DollarSign, color: "#00D4B4" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-2xl p-4"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
              style={{ background: `${color}15` }}
            >
              <Icon size={15} style={{ color }} />
            </div>
            <p className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
              {value}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Top items */}
      <div>
        <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text)" }}>
          Top Items
        </h2>
        {data.top_items.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No orders yet today
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
          >
            {data.top_items.map((item, i) => {
              const Icon = ITEM_ICON[item.item_type] ?? UtensilsCrossed;
              const barWidth = Math.round((item.revenue / maxRev) * 100);
              const accent = item.item_type === "drink" ? "#00D4B4" : "#FF9500";

              return (
                <div
                  key={item.name}
                  className="relative px-5 py-4 overflow-hidden"
                  style={{
                    borderTop: i > 0 ? "1px solid #1E2D42" : "none",
                  }}
                >
                  {/* Bar background */}
                  <div
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{
                      width: `${barWidth}%`,
                      background: `${accent}08`,
                    }}
                  />

                  <div className="relative flex items-center gap-4">
                    <span
                      className="text-sm font-bold w-5 text-center flex-shrink-0 tabular-nums"
                      style={{ color: "var(--muted)" }}
                    >
                      {i + 1}
                    </span>
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${accent}15` }}
                    >
                      <Icon size={14} style={{ color: accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                        {item.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {item.qty} sold
                      </p>
                    </div>
                    <p className="text-sm font-bold flex-shrink-0 tabular-nums" style={{ color: accent }}>
                      {formatNGN(item.revenue)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
