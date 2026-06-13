"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { formatNGN, timeAgo } from "@/lib/utils";
import { Bell, LogOut, CheckCircle, Clock, ChefHat, Wine } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Alert {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

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
  status: string;
  table_id: string | null;
  items: OrderItem[];
  created_at: string;
}

const ITEM_STATUS_COLOR: Record<string, string> = {
  pending: "#FF9500",
  preparing: "#FF9500",
  ready: "#00D4B4",
  delivered: "#6B7A99",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  open: "#00D4B4",
  partially_served: "#FF9500",
  fully_served: "#00D4B4",
  paid: "#6B7A99",
  cancelled: "#f87171",
};

function StaffContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [buzz, setBuzz] = useState<{
    message: string;
    type: "bar" | "kitchen";
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const router = useRouter();

  function loadOrders() {
    api
      .get("/orders")
      .then((r) => setOrders(r.data))
      .catch(() => {});
  }

  function loadAlerts() {
    api
      .get("/alerts")
      .then((r) => setAlerts(r.data))
      .catch(() => {});
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
      if (msg.event === "bar_order_ready") {
        setBuzz({ message: "Drinks ready at bar!", type: "bar" });
        loadOrders();
      }
      if (msg.event === "kitchen_order_ready") {
        setBuzz({ message: "Food ready at kitchen!", type: "kitchen" });
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
  const activeOrders = orders.filter(
    (o) => !["paid", "cancelled"].includes(o.status)
  );

  const initials =
    user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "??";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Buzz banner ── */}
      {buzz && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 cursor-pointer animate-slide-up"
          style={{
            background:
              buzz.type === "bar"
                ? "linear-gradient(90deg, #00D4B4, #00A88F)"
                : "linear-gradient(90deg, #FF9500, #CC7700)",
            boxShadow:
              buzz.type === "bar"
                ? "0 4px 32px rgba(0,212,180,0.45)"
                : "0 4px 32px rgba(255,149,0,0.45)",
          }}
          onClick={() => setBuzz(null)}
        >
          <div className="flex items-center gap-2.5">
            {buzz.type === "bar" ? (
              <Wine size={18} color="#080D14" />
            ) : (
              <ChefHat size={18} color="#080D14" />
            )}
            <span
              className="font-display font-bold text-sm"
              style={{ color: "#080D14" }}
            >
              {buzz.message}
            </span>
          </div>
          <CheckCircle size={18} color="#080D14" />
        </div>
      )}

      {/* ── Header ── */}
      <header
        className="border-b px-4 py-4 flex items-center justify-between"
        style={{
          background:
            "linear-gradient(180deg, #0A1520 0%, rgba(8,13,20,0.96) 100%)",
          borderColor: "rgba(30,45,66,0.9)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm flex-shrink-0"
            style={{
              background: "rgba(0,212,180,0.12)",
              border: "1px solid rgba(0,212,180,0.25)",
              color: "var(--teal)",
            }}
          >
            {initials}
          </div>
          <div>
            <p
              className="font-display font-bold text-sm leading-none"
              style={{ color: "var(--text)" }}
            >
              {user?.full_name}
            </p>
            <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--muted)" }}>
              {user?.role}
              {user?.zone ? ` · ${user.zone}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-teal animate-status-blink"
              style={{ boxShadow: "0 0 6px rgba(0,212,180,0.7)" }}
            />
            <span className="text-xs font-medium text-teal">Live</span>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="p-4 space-y-5">

        {/* ── Alerts ── */}
        {openAlerts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={14} className="animate-status-blink" style={{ color: "var(--amber)" }} />
              <p
                className="font-display font-bold text-sm"
                style={{ color: "var(--amber)" }}
              >
                Alerts ({openAlerts.length})
              </p>
            </div>
            <div className="space-y-2">
              {openAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-2xl p-4 flex items-center justify-between gap-3 animate-fade-in"
                  style={{
                    background: "rgba(255,149,0,0.05)",
                    border: "1px solid rgba(255,149,0,0.22)",
                  }}
                >
                  <div>
                    <p
                      className="text-sm font-semibold capitalize"
                      style={{ color: "var(--text)" }}
                    >
                      {alert.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {timeAgo(alert.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => ackAlert(alert.id)}
                    className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                    style={{
                      background: "rgba(255,149,0,0.1)",
                      border: "1px solid rgba(255,149,0,0.28)",
                      color: "var(--amber)",
                    }}
                  >
                    ACK
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Active Orders ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-teal" />
            <p
              className="font-display font-bold text-sm"
              style={{ color: "var(--text)" }}
            >
              Active Orders{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                ({activeOrders.length})
              </span>
            </p>
          </div>

          {activeOrders.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "#111827", border: "1px solid #1E2D42" }}
            >
              <span className="text-3xl">🎉</span>
              <p
                className="text-sm mt-3"
                style={{ color: "var(--muted)" }}
              >
                No active orders right now
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.map((order) => {
                const orderTotal = order.items.reduce(
                  (s, i) => s + i.price * i.quantity,
                  0
                );
                const statusColor =
                  ORDER_STATUS_COLOR[order.status] ?? "#6B7A99";

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl overflow-hidden animate-fade-in"
                    style={{ background: "#111827", border: "1px solid #1E2D42" }}
                  >
                    {/* Order header */}
                    <div
                      className="px-4 py-3 flex items-center justify-between"
                      style={{ borderBottom: "1px solid #1E2D42" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: statusColor,
                            boxShadow: `0 0 6px ${statusColor}80`,
                          }}
                        />
                        <span
                          className="text-xs font-semibold capitalize"
                          style={{ color: statusColor }}
                        >
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {timeAgo(order.created_at)}
                        </span>
                        <span
                          className="font-display font-bold text-sm"
                          style={{ color: "var(--text)" }}
                        >
                          {formatNGN(orderTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="px-4 py-3 space-y-2">
                      {order.items.map((item) => {
                        const itemColor =
                          ITEM_STATUS_COLOR[item.status] ?? "#6B7A99";
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span>
                                {item.item_type === "drink" ? "🍸" : "🍽️"}
                              </span>
                              <span style={{ color: "var(--text-soft)" }}>
                                {item.quantity}× {item.name}
                              </span>
                            </div>
                            <span
                              className="px-1.5 py-0.5 rounded-md capitalize font-medium"
                              style={{
                                background: `${itemColor}12`,
                                color: itemColor,
                              }}
                            >
                              {item.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
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
