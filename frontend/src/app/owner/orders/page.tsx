"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { formatNGN, timeAgo } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  item_type: string;
  routed_to: string;
}

interface Order {
  id: string;
  table_label: string | null;
  status: string;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  open: "badge-amber",
  partially_served: "badge-amber",
  fully_served: "badge-teal",
  paid: "badge-teal",
  cancelled: "badge-muted",
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  pending: "text-amber",
  preparing: "text-amber",
  ready: "text-teal",
  delivered: "text-muted",
  cancelled: "text-muted",
};

export default function OrdersPage() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const wsRef = useRef<WebSocket | null>(null);

  function load() {
    api
      .get("/orders")
      .then((r) => setOrders(r.data))
      .catch(() => toast.error("Failed to load orders"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/${user!.venue_id}?token=${token}`
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (["new_order_attendant", "order_item_update", "payment_recorded"].includes(msg.event)) {
        load();
      }
    };
    return () => ws.close();
  }, []);

  const displayed =
    filter === "active"
      ? orders.filter((o) => !["paid", "cancelled"].includes(o.status))
      : orders;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Orders</h1>
          <p className="text-muted text-sm mt-1">Live order tracker</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-bg-hover rounded-xl p-1">
            {(["active", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  filter === f ? "bg-bg-surface text-teal" : "text-muted hover:text-text"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 text-muted hover:text-teal">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-40 bg-bg-card" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-muted">
            {filter === "active" ? "No active orders right now" : "No orders found"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map((order) => (
            <div key={order.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-bold text-text text-lg">
                    {order.table_label ?? "No table"}
                  </p>
                  <p className="text-muted text-xs">{timeAgo(order.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={STATUS_COLOR[order.status] ?? "badge-muted"}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-teal font-semibold text-sm">
                    {formatNGN(order.total_amount)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="text-text-soft">
                      {item.quantity}× {item.name}
                      <span className="text-muted ml-1">
                        ({item.routed_to === "bar" ? "🍹" : item.routed_to === "kitchen" ? "🍽️" : "—"})
                      </span>
                    </span>
                    <span className={ITEM_STATUS_COLOR[item.status] ?? "text-muted"}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
