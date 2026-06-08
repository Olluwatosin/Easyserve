"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { timeAgo } from "@/lib/utils";
import toast from "react-hot-toast";

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

function KitchenContent() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  function loadOrders() {
    api.get("/orders?station=kitchen").then((r) => {
      setOrders(r.data as DisplayOrder[]);
    }).catch(() => {});
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

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-bg-surface border-b border-border px-6 py-4">
        <h1 className="font-display text-2xl font-bold text-amber">Kitchen Display</h1>
        <p className="text-muted text-sm">Food orders queue</p>
      </header>

      <div className="p-6">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted">
            <p className="text-2xl mb-2">🍽️</p>
            <p>No food orders queued</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((order) => {
              const foodItems = order.items.filter(
                (i) => i.routed_to === "kitchen" && i.status !== "delivered"
              );
              if (foodItems.length === 0) return null;
              return (
                <div key={order.id} className="card border-amber/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-display text-lg font-bold text-text">Order</span>
                    <span className="text-muted text-xs">{timeAgo(order.created_at)}</span>
                  </div>
                  <div className="space-y-3">
                    {foodItems.map((item) => (
                      <div key={item.id} className="bg-bg-hover rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="text-text font-semibold">
                              {item.quantity}× {item.name}
                            </p>
                            {item.notes && (
                              <p className="text-muted text-xs mt-0.5">{item.notes}</p>
                            )}
                          </div>
                          <span className={`badge-${item.status === "ready" ? "teal" : "amber"} flex-shrink-0`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {item.status === "pending" && (
                            <button
                              onClick={() => markReady(item.id)}
                              className="text-xs py-1.5 px-3 flex-1 bg-amber/10 text-amber rounded-xl hover:bg-amber/20 transition-colors"
                            >
                              Mark Ready
                            </button>
                          )}
                          {item.status === "ready" && (
                            <button
                              onClick={() => markDelivered(item.id)}
                              className="btn-outline text-xs py-1.5 px-3 flex-1"
                            >
                              Delivered
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
