"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { timeAgo } from "@/lib/utils";
import toast from "react-hot-toast";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  item_type: string;
  routed_to: string;
  status: string;
  notes: string | null;
  order_id: string;
}

interface DisplayOrder {
  id: string;
  created_at: string;
  items: OrderItem[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#FF9500",
  preparing: "#FF9500",
  ready: "#00D4B4",
  delivered: "#6B7A99",
};

function BarContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const router = useRouter();

  function loadOrders() {
    api
      .get("/orders?station=bar")
      .then((r) => setOrders(r.data as DisplayOrder[]))
      .catch(() => {});
  }

  useEffect(() => {
    loadOrders();
    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/bar/${user!.venue_id}?token=${token}`
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "new_order_bar") {
        loadOrders();
        toast("New drink order!", { icon: "🍹" });
      }
    };
    return () => ws.close();
  }, []);

  async function markReady(itemId: string) {
    await api.patch(`/orders/items/${itemId}/status`, { status: "ready" });
    loadOrders();
    toast.success("Drink ready to serve!");
  }

  async function markDelivered(itemId: string) {
    await api.patch(`/orders/items/${itemId}/status`, { status: "delivered" });
    loadOrders();
  }

  const activeOrders = orders.filter((o) =>
    o.items.some((i) => i.routed_to === "bar" && i.status !== "delivered")
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: "linear-gradient(180deg, #0A1520 0%, rgba(8,13,20,0.96) 100%)",
          borderColor: "rgba(0,212,180,0.14)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Subtle bar image strip behind header */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=60')",
          }}
        />

        <div className="relative z-10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
              style={{
                background: "rgba(0,212,180,0.1)",
                border: "1px solid rgba(0,212,180,0.22)",
              }}
            >
              🍸
            </div>
            <div>
              <p
                className="font-display font-bold text-lg leading-none"
                style={{
                  color: "var(--teal)",
                  textShadow: "0 0 20px rgba(0,212,180,0.45)",
                }}
              >
                Bar Display
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {user?.full_name} · {activeOrders.length} active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "#f87171")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--muted)")
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="p-5">
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-36">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 animate-float"
              style={{
                background: "rgba(0,212,180,0.06)",
                border: "1px solid rgba(0,212,180,0.12)",
              }}
            >
              <span className="text-4xl">🍹</span>
            </div>
            <p
              className="font-display text-xl font-semibold"
              style={{ color: "var(--text)" }}
            >
              All caught up
            </p>
            <p className="text-sm mt-1.5" style={{ color: "var(--muted)" }}>
              No drink orders queued right now
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeOrders.map((order) => {
              const drinkItems = order.items.filter(
                (i) => i.routed_to === "bar" && i.status !== "delivered"
              );
              if (drinkItems.length === 0) return null;

              const hasPending = drinkItems.some(
                (i) => i.status === "pending" || i.status === "preparing"
              );
              const accentColor = hasPending
                ? "rgba(255,149,0,0.5)"
                : "rgba(0,212,180,0.45)";

              return (
                <div
                  key={order.id}
                  className="rounded-2xl overflow-hidden animate-fade-in"
                  style={{
                    background: "#111827",
                    border: `1px solid ${accentColor}`,
                    boxShadow: hasPending
                      ? "0 0 24px rgba(255,149,0,0.05)"
                      : "0 0 24px rgba(0,212,180,0.05)",
                  }}
                >
                  {/* Ticket top strip */}
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{
                      background: hasPending
                        ? "rgba(255,149,0,0.05)"
                        : "rgba(0,212,180,0.04)",
                      borderBottom: `1px solid ${accentColor}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🎫</span>
                      <span
                        className="font-mono text-xs font-bold"
                        style={{
                          color: hasPending ? "var(--amber)" : "var(--teal)",
                        }}
                      >
                        #{order.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(order.created_at)}
                    </span>
                  </div>

                  {/* Drink items */}
                  <div className="p-4 space-y-3">
                    {drinkItems.map((item) => {
                      const statusColor = STATUS_COLOR[item.status] ?? "#6B7A99";
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl p-3"
                          style={{
                            background: "rgba(26,37,53,0.7)",
                            border: "1px solid rgba(30,45,66,0.7)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-semibold text-sm"
                                style={{ color: "var(--text)" }}
                              >
                                🍸 {item.quantity}× {item.name}
                              </p>
                              {item.notes && (
                                <p
                                  className="text-xs mt-0.5 italic"
                                  style={{ color: "var(--muted)" }}
                                >
                                  &ldquo;{item.notes}&rdquo;
                                </p>
                              )}
                            </div>
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
                              style={{
                                background: `${statusColor}15`,
                                border: `1px solid ${statusColor}30`,
                                color: statusColor,
                              }}
                            >
                              {item.status}
                            </span>
                          </div>

                          {(item.status === "pending" || item.status === "preparing") && (
                            <button
                              onClick={() => markReady(item.id)}
                              className="w-full py-2 rounded-xl text-xs font-bold transition-all"
                              style={{
                                background: "rgba(0,212,180,0.1)",
                                border: "1px solid rgba(0,212,180,0.3)",
                                color: "var(--teal)",
                              }}
                              onMouseEnter={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.background = "rgba(0,212,180,0.18)";
                                el.style.boxShadow = "0 0 18px rgba(0,212,180,0.2)";
                              }}
                              onMouseLeave={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.background = "rgba(0,212,180,0.1)";
                                el.style.boxShadow = "none";
                              }}
                            >
                              ✓ Mark Ready
                            </button>
                          )}

                          {item.status === "ready" && (
                            <button
                              onClick={() => markDelivered(item.id)}
                              className="w-full py-2 rounded-xl text-xs font-medium transition-all"
                              style={{
                                background: "rgba(107,122,153,0.08)",
                                border: "1px solid rgba(107,122,153,0.2)",
                                color: "var(--muted)",
                              }}
                            >
                              Delivered →
                            </button>
                          )}
                        </div>
                      );
                    })}
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

export default function BarPage() {
  return (
    <AuthGuard allowedRoles={["bartender", "owner"]}>
      <BarContent />
    </AuthGuard>
  );
}
