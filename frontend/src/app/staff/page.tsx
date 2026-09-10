"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ITEM_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  ORDER_STATUS_LABEL,
  isUnpaid,
  needsPayment,
} from "@/lib/orderStatus";
import { ConnectionBanner } from "@/lib/ws";
import { useVenueChannel } from "@/lib/venueChannel";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { formatNGN, timeAgo } from "@/lib/utils";
import { Bell, BellRing, CheckCircle, ChefHat, Clock, LogOut, Wallet, Wine } from "lucide-react";
import toast from "react-hot-toast";

import {
  isUnlocked,
  playEscalation,
  playNewAlert,
  playReady,
  unlock,
} from "@/lib/alertSound";
import { useRouter } from "next/navigation";

interface Alert {
  acknowledged_by: string | null;
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
  total_amount: number;
  service_charge: number;
  vat_amount: number;
  id: string;
  status: string;
  table_id: string | null;
  table_label: string | null;
  items: OrderItem[];
  created_at: string;
}

const ITEM_STATUS_COLOR: Record<string, string> = {
  pending: "#FF9500",
  preparing: "#FF9500",
  ready: "#00D4B4",
  delivered: "#6B7A99",
};



function StaffContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [canTakePayment, setCanTakePayment] = useState(false);
  const [payingOrder, setPayingOrder] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [buzz, setBuzz] = useState<{
    message: string;
    type: "bar" | "kitchen";
  } | null>(null);
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
  }, []);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  // Data refreshes are declared by what they touch; the taxonomy in
  // lib/venueChannel maps events onto them, so a new server event cannot be
  // silently ignored here again. `on` is only for behaviour — sounds, buzzes,
  // toasts — and never replaces the refresh.
  const wsStatus = useVenueChannel(user?.venue_id, {
    onOrders: loadOrders,
    onAlerts: loadAlerts,
    on: {
      new_order_attendant: () => toast("New order arrived", { icon: "🛎️" }),

      bar_order_ready: (d) => {
        const table = d?.table_number ? ` — Table ${d.table_number}` : "";
        setBuzz({ message: `🍸 Drinks ready${table}`, type: "bar" });
        playReady();
      },
      kitchen_order_ready: (d) => {
        const table = d?.table_number ? ` — Table ${d.table_number}` : "";
        setBuzz({ message: `🍽️ Food ready${table}`, type: "kitchen" });
        playReady();
      },

      new_alert: (d) => {
        // Only the attendant this table belongs to is summoned. Everyone else
        // sees it appear quietly, so the room is not a wall of chimes.
        const mine = !d?.assigned_to || d.assigned_to === user?.id;
        if (!mine) return;
        playNewAlert();
        toast(`${d?.table_label ?? "A table"} needs you`, {
          icon: "🔔",
          duration: 8000,
        });
      },
      alert_escalated: (d) => {
        // Nobody answered in time, so this is now everyone's problem.
        playEscalation();
        toast(
          `${d?.table_label ?? "A table"} still waiting — ${d?.waiting_seconds ?? 0}s`,
          { icon: "⏰", duration: 10000 },
        );
      },
      alert_acknowledged: (d) => {
        if (!d?.acknowledged_by || d.acknowledged_by === user?.id) return;
        toast(`${d.acknowledged_by_name ?? "Someone"} has ${d.table_label ?? "it"}`, {
          icon: "✅",
          duration: 4000,
        });
      },
    },
  });

  async function takePayment(order: Order, method: "cash" | "pos") {
    setPayingOrder(order.id);
    try {
      const due =
        Number(order.total_amount) +
        Number(order.service_charge ?? 0) +
        Number(order.vat_amount ?? 0);
      // Deliberately the same path the cashier uses — same cash confirmation,
      // same audit row, same attribution in the shift report. A shortcut that
      // merely flipped a status would put the whole floor outside the money
      // trail this product exists to keep.
      if (method === "cash") {
        await api.post("/payments/cash", {
          order_id: order.id,
          amount: due,
          cash_confirmed: true,
        });
      } else {
        await api.post("/payments", {
          order_id: order.id,
          amount: due,
          method: "pos",
        });
      }
      toast.success("Payment recorded — the guest has their exit pass");
      loadOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Could not record that payment";
      toast.error(msg);
    } finally {
      setPayingOrder(null);
    }
  }

  async function markDelivered(itemId: string) {
    await api.patch(`/orders/items/${itemId}/status`, { status: "delivered" });
    loadOrders();
    toast.success("Delivered!");
  }

  async function ackAlert(id: string) {
    await api.patch(`/alerts/${id}/acknowledge`);
    loadAlerts();
  }

  async function resolveAlert(id: string) {
    await api.patch(`/alerts/${id}/resolve`);
    loadAlerts();
  }

  const openAlerts = alerts.filter((a) => a.status === "pending");
  // Acknowledging means "I am going", not "this is dealt with". Without a
  // closing step the alert stays acknowledged forever, so nothing can measure
  // how long a table actually waited and nobody can see what is still in hand.
  const inProgress = alerts.filter(
    (a) => a.status === "acknowledged" && a.acknowledged_by === user?.id,
  );
  const activeOrders = orders.filter(
    (o) => !["paid", "cancelled"].includes(o.status)
  );

  // The walkout risk in one figure. At close this is the only number on this
  // screen that matters.
  const unpaid = orders.filter((o) => needsPayment(o.status));
  const unpaidValue = unpaid.reduce(
    (sum, o) =>
      sum +
      Number(o.total_amount) +
      Number(o.service_charge ?? 0) +
      Number(o.vat_amount ?? 0),
    0,
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
      <ConnectionBanner status={wsStatus} />

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

        {!soundOn && (
          <button
            onClick={async () => setSoundOn(await unlock())}
            className="w-full mb-4 rounded-xl px-4 py-3 flex items-center gap-3 text-left"
            style={{
              background: "rgba(255,149,0,0.10)",
              border: "1px solid rgba(255,149,0,0.35)",
            }}
          >
            <BellRing size={17} style={{ color: "var(--amber)", flexShrink: 0 }} />
            <span className="flex-1">
              <span
                className="block text-sm font-semibold"
                style={{ color: "var(--amber)" }}
              >
                Turn on alert sound
              </span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--text-soft)" }}>
                Tap once per shift. Without it your phone stays silent when a
                table calls.
              </span>
            </span>
          </button>
        )}

        {inProgress.length > 0 && (
          <div className="mb-5">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--muted)" }}
            >
              You are handling
            </p>
            <div className="space-y-2">
              {inProgress.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(0,212,180,0.07)",
                    border: "1px solid rgba(0,212,180,0.25)",
                  }}
                >
                  <span className="flex-1 text-sm" style={{ color: "var(--text-soft)" }}>
                    {a.type.replace(/_/g, " ")} · {timeAgo(a.created_at)}
                  </span>
                  <button
                    onClick={() => resolveAlert(a.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{
                      background: "rgba(0,212,180,0.16)",
                      color: "var(--teal)",
                      border: "1px solid rgba(0,212,180,0.4)",
                    }}
                  >
                    Done
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerts ── */}
        {unpaid.length > 0 && (
          <div
            className="mb-5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2"
            style={{
              background: "rgba(255,149,0,0.08)",
              border: "1px solid rgba(255,149,0,0.3)",
            }}
          >
            <Wallet size={15} style={{ color: "var(--amber)", flexShrink: 0 }} />
            <span className="text-sm flex-1" style={{ color: "var(--text-soft)" }}>
              <strong style={{ color: "var(--amber)" }}>
                {unpaid.length} table{unpaid.length === 1 ? "" : "s"}
              </strong>{" "}
              served and not yet paid · {formatNGN(unpaidValue)}
            </span>
          </div>
        )}

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
                const due =
                  Number(order.total_amount) +
                  Number(order.service_charge ?? 0) +
                  Number(order.vat_amount ?? 0);
                const owing = needsPayment(order.status);

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
                          {ORDER_STATUS_LABEL[order.status] ?? order.status.replace(/_/g, " ")}
                        </span>
                        {order.table_label && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: "rgba(0,212,180,0.1)",
                              border: "1px solid rgba(0,212,180,0.25)",
                              color: "var(--teal)",
                            }}
                          >
                            {order.table_label}
                          </span>
                        )}
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
                          <div key={item.id}>
                            <div className="flex items-center justify-between text-xs">
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
                            {item.status === "ready" && (
                              <button
                                onClick={() => markDelivered(item.id)}
                                className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                                style={{
                                  background: "rgba(0,212,180,0.08)",
                                  border: "1px solid rgba(0,212,180,0.25)",
                                  color: "var(--teal)",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,180,0.15)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,180,0.08)";
                                }}
                              >
                                <CheckCircle size={12} />
                                Mark Delivered
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {owing && canTakePayment && (
                      <div
                        className="mt-3 pt-3 flex flex-wrap items-center gap-2"
                        style={{ borderTop: "1px solid #1E2D42" }}
                      >
                        <span className="text-sm flex-1" style={{ color: "var(--text-soft)" }}>
                          Due <strong style={{ color: "var(--amber)" }}>{formatNGN(due)}</strong>
                        </span>
                        <button
                          onClick={() => takePayment(order, "cash")}
                          disabled={payingOrder === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{
                            background: "rgba(0,212,180,0.16)",
                            border: "1px solid rgba(0,212,180,0.4)",
                            color: "var(--teal)",
                          }}
                        >
                          {payingOrder === order.id ? "Recording…" : "Cash received"}
                        </button>
                        <button
                          onClick={() => takePayment(order, "pos")}
                          disabled={payingOrder === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "var(--text-soft)",
                          }}
                        >
                          POS
                        </button>
                      </div>
                    )}
                    {owing && !canTakePayment && (
                      <div
                        className="mt-3 pt-3 text-xs"
                        style={{ borderTop: "1px solid #1E2D42", color: "var(--muted)" }}
                      >
                        Due {formatNGN(due)} — send the guest to the cashier.
                      </div>
                    )}
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
