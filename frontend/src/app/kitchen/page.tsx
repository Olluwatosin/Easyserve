"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import toast from "react-hot-toast";
import { CheckCircle, ChefHat, Clock } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  routed_to: string;
  status: string;
  notes: string | null;
}

interface DisplayOrder {
  id: string;
  created_at: string;
  items: OrderItem[];
}

function getElapsed(createdAt: string): string {
  const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getUrgency(createdAt: string): "fresh" | "warn" | "critical" {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 6) return "fresh";
  if (mins < 13) return "warn";
  return "critical";
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() => getElapsed(createdAt));
  const urgency = getUrgency(createdAt);

  useEffect(() => {
    const id = setInterval(() => setElapsed(getElapsed(createdAt)), 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const color =
    urgency === "fresh"
      ? "var(--teal)"
      : urgency === "warn"
      ? "var(--amber)"
      : "#f87171";

  return (
    <span
      className="font-mono text-xs font-bold tabular-nums"
      style={{ color }}
    >
      {elapsed}
    </span>
  );
}

const URGENCY_BORDER: Record<string, string> = {
  fresh: "rgba(0,212,180,0.25)",
  warn: "rgba(255,149,0,0.35)",
  critical: "rgba(239,68,68,0.4)",
};

const URGENCY_TOP: Record<string, string> = {
  fresh: "linear-gradient(90deg, #00D4B4, transparent)",
  warn: "linear-gradient(90deg, #FF9500, transparent)",
  critical: "linear-gradient(90deg, #f87171, transparent)",
};

function KitchenContent() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  function loadOrders() {
    api
      .get("/orders?station=kitchen")
      .then((r) => setOrders(r.data as DisplayOrder[]))
      .catch(() => {});
  }

  useEffect(() => {
    loadOrders();
    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/kitchen/${user!.venue_id}?token=${token}`
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "new_order_kitchen") {
        loadOrders();
        toast("New food order!", { icon: "🍽️" });
      }
    };
    return () => ws.close();
  }, []);

  async function markReady(itemId: string) {
    await api.patch(`/orders/items/${itemId}/status`, { status: "ready" });
    loadOrders();
    toast.success("Marked ready — attendant notified");
  }

  async function markDelivered(itemId: string) {
    await api.patch(`/orders/items/${itemId}/status`, { status: "delivered" });
    loadOrders();
  }

  const pendingCount = orders.reduce(
    (n, o) =>
      n +
      o.items.filter(
        (i) => i.routed_to === "kitchen" && i.status === "pending"
      ).length,
    0
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header
        className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{
          background: "rgba(8,13,20,0.9)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{
              background: "rgba(255,149,0,0.12)",
              border: "1px solid rgba(255,149,0,0.2)",
            }}
          >
            <ChefHat size={18} className="text-amber" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-amber leading-none">
              Kitchen Display
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Food orders queue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(255,149,0,0.1)",
                border: "1px solid rgba(255,149,0,0.25)",
              }}
            >
              <Clock size={13} className="text-amber" />
              <span className="text-amber text-xs font-semibold">
                {pendingCount} pending
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-teal animate-status-blink"
              style={{ boxShadow: "0 0 6px rgba(0,212,180,0.6)" }}
            />
            <span className="text-teal text-xs font-medium">Live</span>
          </div>
        </div>
      </header>

      <div className="p-5">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(107,122,153,0.1)", border: "1px solid #1E2D42" }}
            >
              <ChefHat size={28} style={{ color: "var(--muted)" }} />
            </div>
            <div className="text-center">
              <p className="font-display font-semibold" style={{ color: "var(--muted)" }}>
                Kitchen is clear
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)", opacity: 0.6 }}>
                No food orders queued
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orders.map((order) => {
              const foodItems = order.items.filter(
                (i) => i.routed_to === "kitchen" && i.status !== "delivered"
              );
              if (foodItems.length === 0) return null;
              const urgency = getUrgency(order.created_at);

              return (
                <div
                  key={order.id}
                  className="rounded-card overflow-hidden animate-fade-in"
                  style={{
                    background: "#1A2535",
                    border: `1px solid ${URGENCY_BORDER[urgency]}`,
                  }}
                >
                  {/* Top accent stripe */}
                  <div className="h-0.5" style={{ background: URGENCY_TOP[urgency] }} />

                  <div className="p-4">
                    {/* Order header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-display font-bold text-base"
                          style={{ color: "var(--text)" }}
                        >
                          Order
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-bg-hover" style={{ color: "var(--muted)" }}>
                          #{order.id.slice(-4).toUpperCase()}
                        </span>
                      </div>
                      <ElapsedTimer createdAt={order.created_at} />
                    </div>

                    {/* Items */}
                    <div className="space-y-2.5">
                      {foodItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl p-3"
                          style={{ background: "rgba(36,48,68,0.6)" }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-semibold text-sm leading-snug"
                                style={{ color: "var(--text)" }}
                              >
                                <span
                                  className="font-mono mr-1.5 font-bold"
                                  style={{ color: "var(--amber)" }}
                                >
                                  {item.quantity}×
                                </span>
                                {item.name}
                              </p>
                              {item.notes && (
                                <p
                                  className="text-xs mt-0.5 italic"
                                  style={{ color: "var(--muted)" }}
                                >
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            <span
                              className={
                                item.status === "ready" ? "badge-teal" : "badge-amber"
                              }
                            >
                              {item.status}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            {item.status === "pending" && (
                              <button
                                onClick={() => markReady(item.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
                                style={{
                                  background: "rgba(255,149,0,0.12)",
                                  border: "1px solid rgba(255,149,0,0.2)",
                                  color: "var(--amber)",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    "rgba(255,149,0,0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    "rgba(255,149,0,0.12)";
                                }}
                              >
                                <CheckCircle size={13} />
                                Mark Ready
                              </button>
                            )}
                            {item.status === "ready" && (
                              <button
                                onClick={() => markDelivered(item.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
                                style={{
                                  background: "rgba(0,212,180,0.1)",
                                  border: "1px solid rgba(0,212,180,0.2)",
                                  color: "var(--teal)",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    "rgba(0,212,180,0.18)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    "rgba(0,212,180,0.1)";
                                }}
                              >
                                <CheckCircle size={13} />
                                Delivered
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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

export default function KitchenPage() {
  return (
    <AuthGuard allowedRoles={["kitchen", "owner"]}>
      <KitchenContent />
    </AuthGuard>
  );
}
