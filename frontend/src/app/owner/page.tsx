"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";

interface Summary {
  today_revenue: number;
  active_orders: number;
  tables_served_today: number;
  pending_alerts: number;
}

export default function OwnerOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get("/analytics/summary")
      .then((r) => setSummary(r.data))
      .catch(() => toast.error("Failed to load summary"));
  }, []);

  const stats = summary
    ? [
        {
          label: "Today's Revenue",
          value: formatNGN(summary.today_revenue),
          icon: TrendingUp,
          color: "teal",
        },
        {
          label: "Active Orders",
          value: summary.active_orders.toLocaleString(),
          icon: ShoppingBag,
          color: "teal",
        },
        {
          label: "Tables Served Today",
          value: summary.tables_served_today.toString(),
          icon: Clock,
          color: "amber",
        },
        {
          label: "Pending Alerts",
          value: summary.pending_alerts.toString(),
          icon: AlertTriangle,
          color: summary.pending_alerts > 0 ? "red" : "muted",
        },
      ]
    : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text">Overview</h1>
        <p className="text-muted text-sm mt-1">Real-time venue snapshot</p>
      </div>

      {!summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-28 bg-bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card flex items-start gap-4">
              <div
                className={`p-2.5 rounded-xl ${
                  color === "teal"
                    ? "bg-teal/10 text-teal"
                    : color === "amber"
                    ? "bg-amber/10 text-amber"
                    : color === "red"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-bg-hover text-muted"
                }`}
              >
                <Icon size={20} />
              </div>
              <div>
                <p className="text-muted text-xs font-medium">{label}</p>
                <p className="font-display text-2xl font-bold text-text mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
