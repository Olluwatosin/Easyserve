"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useVenueChannel } from "@/lib/venueChannel";
import { useAuthStore } from "@/stores/auth";
import { formatNGN, timeAgo, formatTime } from "@/lib/utils";
import toast from "react-hot-toast";

/* ── Types ─────────────────────────────────────────────────────────── */

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

/* ── Helpers ────────────────────────────────────────────────────────── */

function orderStatusBadge(status: string) {
  switch (status) {
    case "open":
    case "partially_served":
      return <span className="badge-amber capitalize">{status.replace(/_/g, " ")}</span>;
    case "fully_served":
      return <span className="badge-teal capitalize">{status.replace(/_/g, " ")}</span>;
    case "paid":
      return <span className="badge-muted capitalize">Paid</span>;
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 text-xs font-medium px-2.5 py-1 rounded-full capitalize">
          Cancelled
        </span>
      );
    default:
      return <span className="badge-muted capitalize">{status.replace(/_/g, " ")}</span>;
  }
}

function itemEmoji(item: OrderItem): string {
  if (item.routed_to === "bar" || item.item_type === "bar") return "🍸";
  if (item.routed_to === "kitchen" || item.item_type === "kitchen") return "🍽️";
  return "🍴";
}

const ACTIVE_STATUSES = ["open", "partially_served", "fully_served"];

/* ── Skeleton card ──────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="rounded-[16px] border border-[#1E2D42] bg-[#1A2535] p-4 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-[#243044]" />
          <div className="h-3 w-14 rounded bg-[#243044]" />
        </div>
        <div className="space-y-2 items-end flex flex-col">
          <div className="h-5 w-16 rounded-full bg-[#243044]" />
          <div className="h-3 w-12 rounded bg-[#243044]" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-[#243044]" />
        <div className="h-3 w-3/4 rounded bg-[#243044]" />
      </div>
    </div>
  );
}

/* ── Timeline ───────────────────────────────────────────────────────── */

interface TimelineStep {
  label: string;
  timestamp: string | null;
  done: boolean;
}

function getTimeline(order: Order): TimelineStep[] {
  const placed = order.created_at;
  const isPrep =
    order.items.some((i) => ["preparing", "ready"].includes(i.status)) ||
    ["partially_served", "fully_served", "paid"].includes(order.status);
  const isServed = ["fully_served", "paid"].includes(order.status);
  const isPaid = order.status === "paid";

  return [
    { label: "Order placed", timestamp: placed, done: true },
    { label: "Items preparing", timestamp: isPrep ? order.created_at : null, done: isPrep },
    { label: "Served", timestamp: isServed ? order.updated_at : null, done: isServed },
    { label: "Paid", timestamp: isPaid ? order.updated_at : null, done: isPaid },
  ];
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function OrdersPage() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(() => {
    api
      .get("/orders")
      .then((r) => setOrders(r.data))
      .catch(() => toast.error("Failed to load orders"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  // Was the only screen listening for order_item_update; now it says so by
  // name instead of by a list that happened to be complete.
  useVenueChannel(user?.venue_id, { onOrders: load });

  const displayed =
    filter === "active"
      ? orders.filter((o) => !["paid", "cancelled"].includes(o.status))
      : orders;

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  async function markFullyServed() {
    if (!selected) return;
    setMarking(true);
    try {
      await api.patch(`/orders/${selected.id}/status`, { status: "fully_served" });
      toast.success("Order marked as fully served");
      load();
    } catch {
      toast.error("Failed to update order status");
    } finally {
      setMarking(false);
    }
  }

  const activeCount = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const timeline = selected ? getTimeline(selected) : [];

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div
        className="flex flex-col overflow-hidden border-r shrink-0"
        style={{
          width: "38%",
          borderColor: "var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Panel header */}
        <div
          className="shrink-0 px-5 pt-5 pb-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              {/* Live blink dot */}
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="animate-status-blink absolute inline-flex h-full w-full rounded-full"
                  style={{ background: "#00D4B4", opacity: 0.75 }}
                />
                <span
                  className="relative inline-flex rounded-full h-2.5 w-2.5"
                  style={{ background: "#00D4B4" }}
                />
              </span>
              <h2
                className="font-display font-bold text-lg"
                style={{ color: "var(--text)" }}
              >
                Live Orders
              </h2>
              {activeCount > 0 && (
                <span className="badge-teal">{activeCount}</span>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ background: "var(--bg-hover)" }}
          >
            {(["active", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize"
                style={
                  filter === f
                    ? {
                        background: "var(--bg-card)",
                        color: "var(--teal)",
                      }
                    : {
                        color: "var(--muted)",
                      }
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 gap-3">
              <div
                className="text-5xl"
                style={{ filter: "grayscale(0.4)" }}
              >
                🧾
              </div>
              <p
                className="text-sm text-center"
                style={{ color: "var(--muted)" }}
              >
                {filter === "active"
                  ? "No active orders right now"
                  : "No orders found"}
              </p>
            </div>
          ) : (
            displayed.map((order) => {
              const isSelected = order.id === selectedId;
              const previewItems = order.items.slice(0, 2);

              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className="w-full text-left rounded-[14px] border p-4 transition-all duration-150 group"
                  style={{
                    background: isSelected
                      ? "rgba(0,212,180,0.06)"
                      : "var(--bg-card)",
                    borderColor: isSelected
                      ? "rgba(0,212,180,0.45)"
                      : "var(--border)",
                    boxShadow: isSelected
                      ? "0 0 0 1px rgba(0,212,180,0.12), 0 4px 20px rgba(0,0,0,0.35)"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(0,212,180,0.25)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border)";
                    }
                  }}
                >
                  {/* Row 1: table + status */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p
                        className="font-display font-bold text-base leading-tight"
                        style={{ color: "var(--text)" }}
                      >
                        {order.table_label ?? "No table"}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--muted)" }}
                      >
                        {timeAgo(order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                      {orderStatusBadge(order.status)}
                      <span
                        className="text-xs font-semibold font-mono"
                        style={{ color: "var(--teal)" }}
                      >
                        {formatNGN(order.total_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: item preview */}
                  {previewItems.length > 0 && (
                    <div className="space-y-0.5">
                      {previewItems.map((item) => (
                        <p
                          key={item.id}
                          className="text-xs truncate max-w-[200px]"
                          style={{ color: "var(--text-soft)" }}
                        >
                          {item.quantity}× {item.name}
                        </p>
                      ))}
                      {order.items.length > 2 && (
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          +{order.items.length - 2} more
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ background: "var(--bg-surface)" }}
      >
        {selected === null ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-6xl" style={{ filter: "grayscale(0.3) opacity(0.55)" }}>
              🧾
            </div>
            <div className="text-center space-y-1">
              <p
                className="font-display font-semibold text-lg"
                style={{ color: "var(--text-soft)" }}
              >
                Select an order to view details
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Pick any order from the queue on the left
              </p>
            </div>
          </div>
        ) : (
          /* Order detail */
          <div className="animate-fade-in flex flex-col gap-0 h-full">
            {/* Detail header */}
            <div
              className="shrink-0 px-7 pt-6 pb-5 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <h1
                    className="font-display font-bold text-3xl"
                    style={{ color: "var(--text)" }}
                  >
                    {selected.table_label ?? "No table"}
                  </h1>
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{
                        background: "var(--bg-hover)",
                        color: "var(--muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      #{selected.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(selected.created_at)}
                    </span>
                  </div>
                </div>
                <div className="mt-1">{orderStatusBadge(selected.status)}</div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
              {/* Items table */}
              <div
                className="rounded-[14px] border overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        background: "var(--bg-card)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {["Item", "Qty", "Unit price", "Total", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: "var(--muted)" }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item, idx) => (
                      <tr
                        key={item.id}
                        style={{
                          background:
                            idx % 2 === 0 ? "transparent" : "rgba(26,37,53,0.5)",
                          borderBottom:
                            idx < selected.items.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                        }}
                      >
                        <td className="px-4 py-3">
                          <span style={{ color: "var(--text)" }}>
                            {itemEmoji(item)}{" "}
                            <span className="font-medium">{item.name}</span>
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: "var(--text-soft)" }}
                        >
                          {item.quantity}
                        </td>
                        <td
                          className="px-4 py-3 font-mono"
                          style={{ color: "var(--text-soft)" }}
                        >
                          {formatNGN(item.price)}
                        </td>
                        <td
                          className="px-4 py-3 font-mono font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {formatNGN(item.price * item.quantity)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs font-medium capitalize"
                            style={{
                              color:
                                item.status === "delivered"
                                  ? "var(--muted)"
                                  : item.status === "ready"
                                  ? "var(--teal)"
                                  : item.status === "preparing" ||
                                    item.status === "pending"
                                  ? "var(--amber)"
                                  : "var(--muted)",
                            }}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Total row */}
                  <tfoot>
                    <tr
                      style={{
                        borderTop: "2px solid var(--border)",
                        background: "var(--bg-card)",
                      }}
                    >
                      <td
                        colSpan={3}
                        className="px-4 py-3 font-display font-semibold text-right"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Order Total
                      </td>
                      <td colSpan={2} className="px-4 py-3">
                        <span className="gradient-text font-display font-bold text-xl">
                          {formatNGN(selected.total_amount)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Timeline */}
              <div
                className="rounded-[14px] border p-5"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-card)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--muted)" }}
                >
                  Order Timeline
                </p>
                <div className="flex items-start gap-0">
                  {timeline.map((step, i) => (
                    <div key={step.label} className="flex-1 flex flex-col items-center relative">
                      {/* Connector line before dot (except first) */}
                      {i > 0 && (
                        <div
                          className="absolute left-0 top-[9px] w-1/2 h-[2px]"
                          style={{
                            background: timeline[i - 1].done
                              ? "var(--teal)"
                              : "var(--border)",
                          }}
                        />
                      )}
                      {/* Connector line after dot (except last) */}
                      {i < timeline.length - 1 && (
                        <div
                          className="absolute right-0 top-[9px] w-1/2 h-[2px]"
                          style={{
                            background: step.done ? "var(--teal)" : "var(--border)",
                          }}
                        />
                      )}
                      {/* Dot */}
                      <div
                        className="relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center mb-2"
                        style={{
                          borderColor: step.done ? "var(--teal)" : "var(--border)",
                          background: step.done
                            ? "var(--teal)"
                            : "var(--bg-surface)",
                          boxShadow: step.done
                            ? "0 0 10px rgba(0,212,180,0.45)"
                            : "none",
                        }}
                      >
                        {step.done && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M2 5l2 2 4-4"
                              stroke="#080D14"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      {/* Label */}
                      <p
                        className="text-xs font-medium text-center leading-tight"
                        style={{
                          color: step.done ? "var(--text)" : "var(--muted)",
                        }}
                      >
                        {step.label}
                      </p>
                      {/* Timestamp */}
                      {step.timestamp && (
                        <p
                          className="text-[10px] mt-0.5 text-center"
                          style={{ color: "var(--muted)" }}
                        >
                          {formatTime(step.timestamp)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {!["paid", "cancelled"].includes(selected.status) && (
                <div className="flex gap-3 pb-2">
                  <button
                    onClick={markFullyServed}
                    disabled={marking || selected.status === "fully_served"}
                    className="btn-outline text-sm py-2.5 px-5"
                  >
                    {marking ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        Updating…
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 8l3 3 7-7"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Mark Fully Served
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
