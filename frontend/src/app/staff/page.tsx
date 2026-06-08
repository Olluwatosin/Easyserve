"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { formatNGN, timeAgo } from "@/lib/utils";
import { Bell, LogOut, CheckCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Alert {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

interface Order {
  id: string;
  status: string;
  table_id: string | null;
  items: Array<{ id: string; name: string; quantity: number; price: number; status: string; item_type: string; routed_to: string }>;
  created_at: string;
}

function StaffContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [buzz, setBuzz] = useState<{ orderId: string; message: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const router = useRouter();

  function loadOrders() {
    api.get("/orders").then((r) => setOrders(r.data)).catch(() => {});
  }

  function loadAlerts() {
    api.get("/alerts").then((r) => setAlerts(r.data)).catch(() => {});
  }

  useEffect(() => {
    loadOrders();
    loadAlerts();

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/${user!.venue_id}?token=${token}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "new_order_attendant") {
        loadOrders();
        toast("New order arrived", { icon: "🛎️" });
      }
      if (msg.event === "bar_order_ready" || msg.event === "kitchen_order_ready") {
        setBuzz({ orderId: msg.data?.order_id ?? "", message: msg.event === "bar_order_ready" ? "Drinks ready at bar!" : "Food ready at kitchen!" });
        loadOrders();
      }
      if (msg.event === "new_alert") {
        loadAlerts();
        toast("Table alert!", { icon: "🔔" });
      }
      if (msg.event === "alert_resolved") {
        loadAlerts();
      }
    };

    return () => ws.close();
  }, []);

  async function ackAlert(id: string) {
    await api.patch(`/alerts/${id}/acknowledge`);
    loadAlerts();
  }

  const openAlerts = alerts.filter((a) => a.status === "pending");
  const activeOrders = orders.filter((o) => !["paid", "cancelled"].includes(o.status));

  return (
    <div className="min-h-screen bg-bg">
      {/* Buzz banner */}
      {buzz && (
        <div
          className="fixed top-0 left-0 right-0 z-50 bg-teal text-bg px-4 py-3 flex items-center justify-between animate-slide-up cursor-pointer"
          onClick={() => setBuzz(null)}
        >
          <span className="font-semibold text-sm">{buzz.message}</span>
          <CheckCircle size={18} />
        </div>
      )}

      {/* Header */}
      <header className="bg-bg-surface border-b border-border px-4 py-4 flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-text">{user?.full_name}</p>
          <p className="text-muted text-xs capitalize">{user?.role}{user?.zone ? ` · ${user.zone}` : ""}</p>
        </div>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          className="p-2 text-muted hover:text-red-400"
        >
          <LogOut size={18} />
        </button>
      </header>

      <div className="p-4 space-y-5">
        {/* Alerts */}
        {openAlerts.length > 0 && (
          <div>
            <h2 className="font-display font-semibold text-amber mb-2 flex items-center gap-2">
              <Bell size={16} /> Alerts ({openAlerts.length})
            </h2>
            <div className="space-y-2">
              {openAlerts.map((alert) => (
                <div key={alert.id} className="card border-amber/30 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-text text-sm font-medium capitalize">{alert.type.replace(/_/g, " ")}</p>
                    <p className="text-muted text-xs mt-1">{timeAgo(alert.created_at)}</p>
                  </div>
                  <button
                    onClick={() => ackAlert(alert.id)}
                    className="flex-shrink-0 btn-teal text-xs py-1.5 px-3"
                  >
                    ACK
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active orders */}
        <div>
          <h2 className="font-display font-semibold text-text mb-2 flex items-center gap-2">
            <Clock size={16} className="text-teal" /> Active Orders ({activeOrders.length})
          </h2>
          {activeOrders.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-muted text-sm">No active orders</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.map((order) => {
                const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                return (
                  <div key={order.id} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-muted text-xs">Order</span>
                      <div className="flex items-center gap-2">
                        <span className={`badge-${order.status === "pending" ? "amber" : "teal"}`}>
                          {order.status}
                        </span>
                        <span className="text-text text-sm font-semibold">{formatNGN(orderTotal)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-text-soft">{item.quantity}× {item.name}</span>
                          <span className={`badge-${item.status === "ready" || item.status === "delivered" ? "teal" : "amber"}`}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-muted text-xs mt-2">{timeAgo(order.created_at)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StaffPage() {
  return (
    <AuthGuard allowedRoles={["attendant"]}>
      <StaffContent />
    </AuthGuard>
  );
}
