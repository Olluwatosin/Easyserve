"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { formatNGN, timeAgo } from "@/lib/utils";
import {
  CreditCard,
  Banknote,
  Building2,
  Smartphone,
  LogOut,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Order {
  id: string;
  status: string;
  table_label: string | null;
  items: Array<{ id: string; name: string; quantity: number; price: number }>;
  created_at: string;
}

type PayMethod = "cash" | "card" | "transfer" | "mobile_wallet";

const METHODS: {
  id: PayMethod;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { id: "cash",          label: "Cash",     icon: Banknote,    color: "#00D4B4" },
  { id: "card",          label: "Card",     icon: CreditCard,  color: "#818CF8" },
  { id: "transfer",      label: "Transfer", icon: Building2,   color: "#38BDF8" },
  { id: "mobile_wallet", label: "Mobile",   icon: Smartphone,  color: "#FF9500" },
];

function CashierContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [reference, setReference] = useState("");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  function loadOrders() {
    api
      .get("/orders")
      .then((r) =>
        setOrders(
          (r.data as Order[]).filter(
            (o) => o.status !== "paid" && o.status !== "cancelled"
          )
        )
      )
      .catch(() => {});
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const total = selected
    ? selected.items.reduce((s, i) => s + i.price * i.quantity, 0)
    : 0;

  async function processPayment() {
    if (!selected) return;
    if (method === "cash" && !cashConfirmed) {
      toast.error("Confirm cash received first");
      return;
    }
    setProcessing(true);
    try {
      const endpoint = method === "cash" ? "/payments/cash" : "/payments";
      const body =
        method === "cash"
          ? { order_id: selected.id, amount: total, cash_confirmed: true }
          : { order_id: selected.id, amount: total, method };
      await api.post(endpoint, body);
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setSelected(null);
        setCashConfirmed(false);
        setReference("");
        loadOrders();
      }, 2400);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Payment failed";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Header ── */}
      <header
        className="flex-shrink-0 border-b px-6 py-4 flex items-center justify-between"
        style={{
          background:
            "linear-gradient(180deg, #0A1520 0%, rgba(8,13,20,0.96) 100%)",
          borderColor: "rgba(30,45,66,0.9)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(0,212,180,0.1)",
              border: "1px solid rgba(0,212,180,0.2)",
            }}
          >
            <CreditCard size={16} className="text-teal" />
          </div>
          <div>
            <p
              className="font-display font-bold text-sm"
              style={{ color: "var(--text)" }}
            >
              Cashier Terminal
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {user?.full_name}
            </p>
          </div>
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
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Order queue ── */}
        <div
          className="w-[44%] flex-shrink-0 border-r overflow-y-auto p-4 space-y-3"
          style={{ borderColor: "#1E2D42" }}
        >
          <div className="flex items-center justify-between mb-1">
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--muted)" }}
            >
              Unpaid Orders
            </p>
            {orders.length > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,149,0,0.12)",
                  color: "var(--amber)",
                }}
              >
                {orders.length}
              </span>
            )}
          </div>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <span className="text-4xl mb-3">🎉</span>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-soft)" }}
              >
                All clear
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                No unpaid orders
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const orderTotal = order.items.reduce(
                (s, i) => s + i.price * i.quantity,
                0
              );
              const isSelected = selected?.id === order.id;
              return (
                <button
                  key={order.id}
                  onClick={() => {
                    setSelected(order);
                    setDone(false);
                  }}
                  className="w-full rounded-2xl p-4 text-left transition-all"
                  style={{
                    background: isSelected
                      ? "rgba(0,212,180,0.06)"
                      : "#111827",
                    border: isSelected
                      ? "1px solid rgba(0,212,180,0.4)"
                      : "1px solid #1E2D42",
                    boxShadow: isSelected
                      ? "0 0 20px rgba(0,212,180,0.07)"
                      : "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className="font-semibold text-sm"
                        style={{ color: "var(--text)" }}
                      >
                        {order.table_label ?? "No table"}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--muted)" }}
                      >
                        {order.items.length} item
                        {order.items.length !== 1 ? "s" : ""} ·{" "}
                        {timeAgo(order.created_at)}
                      </p>
                    </div>
                    <span
                      className="font-display font-bold text-sm flex-shrink-0"
                      style={{
                        color: isSelected ? "var(--teal)" : "var(--text)",
                      }}
                    >
                      {formatNGN(orderTotal)}
                    </span>
                  </div>
                  {order.items.slice(0, 2).map((item) => (
                    <p
                      key={item.id}
                      className="text-xs mt-1.5 truncate"
                      style={{ color: "var(--muted)" }}
                    >
                      {item.quantity}× {item.name}
                    </p>
                  ))}
                  {order.items.length > 2 && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      +{order.items.length - 2} more
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* ── Right: Payment panel ── */}
        <div className="flex-1 overflow-y-auto p-5">

          {done ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{
                  background: "rgba(0,212,180,0.1)",
                  border: "1px solid rgba(0,212,180,0.3)",
                  boxShadow: "0 0 44px rgba(0,212,180,0.22)",
                }}
              >
                <CheckCircle size={38} className="text-teal" />
              </div>
              <p
                className="font-display text-2xl font-bold"
                style={{ color: "var(--text)" }}
              >
                Payment Recorded
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Exit pass generated — customer is good to go
              </p>
            </div>
          ) : !selected ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: "rgba(107,122,153,0.06)",
                  border: "1px solid #1E2D42",
                  opacity: 0.4,
                }}
              >
                <CreditCard size={28} style={{ color: "var(--muted)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Select an order to process payment
              </p>
            </div>
          ) : (
            /* Payment form */
            <div className="space-y-5 animate-fade-in">

              {/* Order summary */}
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: "var(--muted)" }}
                >
                  Order Summary
                </p>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ background: "#111827", border: "1px solid #1E2D42" }}
                >
                  {selected.items.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                      style={{
                        borderTop: i > 0 ? "1px solid #1E2D42" : "none",
                      }}
                    >
                      <span style={{ color: "var(--text-soft)" }}>
                        {item.quantity}× {item.name}
                      </span>
                      <span style={{ color: "var(--text)" }}>
                        {formatNGN(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                  <div
                    className="flex items-center justify-between px-4 py-4"
                    style={{
                      borderTop: "1px solid rgba(0,212,180,0.18)",
                      background: "rgba(0,212,180,0.03)",
                    }}
                  >
                    <span
                      className="font-semibold text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      Total
                    </span>
                    <span className="font-display text-2xl font-bold gradient-text">
                      {formatNGN(total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: "var(--muted)" }}
                >
                  Payment Method
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {METHODS.map(({ id, label, icon: Icon, color }) => {
                    const active = method === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setMethod(id)}
                        className="py-4 px-4 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all"
                        style={{
                          background: active ? `${color}12` : "#111827",
                          border: active
                            ? `1px solid ${color}50`
                            : "1px solid #1E2D42",
                          boxShadow: active ? `0 0 22px ${color}14` : "none",
                          color: active ? color : "var(--muted)",
                        }}
                      >
                        <Icon
                          size={18}
                          style={{ color: active ? color : "var(--muted)" }}
                        />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {method !== "cash" && (
                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-widest mb-2"
                    style={{ color: "var(--muted)" }}
                  >
                    Reference (optional)
                  </label>
                  <input
                    className="input"
                    placeholder="Transaction reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              )}

              {method === "cash" && (
                <label
                  className="flex items-center gap-3 cursor-pointer py-3.5 px-4 rounded-xl"
                  style={{
                    background: "rgba(0,212,180,0.04)",
                    border: "1px solid rgba(0,212,180,0.14)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cashConfirmed}
                    onChange={(e) => setCashConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal"
                  />
                  <span className="text-sm" style={{ color: "var(--text-soft)" }}>
                    Cash received —{" "}
                    <span className="font-semibold text-teal">
                      {formatNGN(total)}
                    </span>
                  </span>
                </label>
              )}

              <button
                onClick={processPayment}
                disabled={processing || (method === "cash" && !cashConfirmed)}
                className="btn-teal w-full py-4 text-base"
              >
                {processing ? "Processing…" : `Confirm · ${formatNGN(total)}`}
              </button>

              <button
                onClick={() => {
                  setSelected(null);
                  setCashConfirmed(false);
                  setReference("");
                }}
                className="w-full text-sm py-2"
                style={{ color: "var(--muted)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CashierPage() {
  return (
    <AuthGuard allowedRoles={["cashier", "owner"]}>
      <CashierContent />
    </AuthGuard>
  );
}
