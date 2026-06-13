"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import { TrendingUp, ShoppingBag, Armchair, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

interface Summary {
  today_revenue: number;
  active_orders: number;
  tables_served_today: number;
  pending_alerts: number;
}

const STAT_CONFIG = [
  {
    key: "today_revenue" as const,
    label: "Revenue Today",
    icon: TrendingUp,
    accent: "#00D4B4",
    glow: "rgba(0,212,180,0.15)",
    format: (v: number) => formatNGN(v),
  },
  {
    key: "active_orders" as const,
    label: "Active Orders",
    icon: ShoppingBag,
    accent: "#00D4B4",
    glow: "rgba(0,212,180,0.12)",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "tables_served_today" as const,
    label: "Tables Served",
    icon: Armchair,
    accent: "#FF9500",
    glow: "rgba(255,149,0,0.12)",
    format: (v: number) => v.toString(),
  },
  {
    key: "pending_alerts" as const,
    label: "Pending Alerts",
    icon: AlertTriangle,
    accent: null,
    glow: null,
    format: (v: number) => v.toString(),
  },
];

function StatSkeleton() {
  return (
    <div className="rounded-card border border-border p-6 bg-bg-card animate-pulse h-[130px]" />
  );
}

export default function OwnerOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get("/analytics/summary")
      .then((r) => setSummary(r.data))
      .catch(() => toast.error("Failed to load summary"));
  }, []);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text)" }}>
          Overview
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Real-time venue snapshot
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!summary
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : STAT_CONFIG.map(({ key, label, icon: Icon, accent, glow, format }) => {
              const value = summary[key];
              const isAlert = key === "pending_alerts";
              const alertColor = isAlert && value > 0 ? "#f87171" : null;
              const cardAccent = alertColor ?? accent;
              const cardGlow = isAlert && value > 0 ? "rgba(239,68,68,0.12)" : glow;

              return (
                <div
                  key={key}
                  className="rounded-card p-6 flex flex-col gap-4 transition-all duration-200 cursor-default"
                  style={{
                    background: "#1A2535",
                    border: `1px solid ${cardAccent ? `${cardAccent}25` : "#1E2D42"}`,
                    boxShadow: cardGlow ? `0 0 32px ${cardGlow}` : undefined,
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="p-2 rounded-xl"
                      style={{
                        background: cardAccent ? `${cardAccent}18` : "rgba(107,122,153,0.12)",
                        border: `1px solid ${cardAccent ? `${cardAccent}25` : "rgba(107,122,153,0.18)"}`,
                      }}
                    >
                      <Icon
                        size={18}
                        style={{ color: cardAccent ?? "var(--muted)" }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                      today
                    </span>
                  </div>

                  <div>
                    <p
                      className="text-xs font-medium uppercase tracking-wide mb-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {label}
                    </p>
                    <p
                      className="font-display text-3xl font-bold leading-none"
                      style={{ color: cardAccent ?? "var(--text)" }}
                    >
                      {format(value)}
                    </p>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
