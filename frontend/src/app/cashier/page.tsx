"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { formatNGN, timeAgo } from "@/lib/utils";
import { CreditCard, Banknote, SplitSquareHorizontal, LogOut } from "lucide-react";
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

function CashierContent() {
  const { user, logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [reference, setReference] = useState(""); // displayed only, not sent to API
  const [processing, setProcessing] = useState(false);
  const router = useRouter();

  function loadOrders() {
    api.get("/orders").then((r) => {
      setOrders(
        (r.data as Order[]).filter((o) => o.status !== "paid" && o.status !== "cancelled")
      );
    }).catch(() => {});
  }

  useEffect(() => { loadOrders(); }, []);

  const total = selected
    ? selected.items.reduce((s, i) => s + i.price * i.quantity, 0)
    : 0;

  async function processPayment() {
    if (!selected) return;
    if (method === "cash" && !cashConfirmed) {
      toast.error("Please confirm cash received before processing");
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
      toast.success("Payment recorded! Exit pass generated.");
      setSelected(null);
      setCashConfirmed(false);
      setReference("");
      loadOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Payment failed";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="bg-bg-surface border-b border-border px-4 py-4 flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-text">Cashier Terminal</p>
          <p className="text-muted text-xs">{user?.full_name}</p>
        </div>
        <button onClick={() => { logout(); router.replace("/login"); }} className="p-2 text-muted hover:text-red-400">
          <LogOut size={18} />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Order list */}
        <div className="w-1/2 border-r border-border overflow-y-auto p-4 space-y-3">
          <h2 className="font-display font-semibold text-text-soft text-sm mb-2">Unpaid Orders</h2>
          {orders.length === 0 ? (
            <p className="text-muted text-sm text-center py-12">No unpaid orders</p>
          ) : (
            orders.map((order) => {
              const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
              return (
                <button
                  key={order.id}
                  onClick={() => setSelected(order)}
                  className={`w-full card text-left transition-colors ${
                    selected?.id === order.id ? "border-teal" : "hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-text text-sm font-medium">
                      {order.table_label ?? "No table"} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-teal font-semibold text-sm">{formatNGN(orderTotal)}</span>
                  </div>
                  <p className="text-muted text-xs mt-1">{timeAgo(order.created_at)}</p>
                </button>
              );
            })
          )}
        </div>

        {/* Payment panel */}
        <div className="w-1/2 p-4 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <CreditCard size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Select an order to process payment</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="font-display font-semibold text-text">Process Payment</h2>

              {/* Order summary */}
              <div className="card space-y-2">
                {selected.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-soft">{item.quantity}× {item.name}</span>
                    <span className="text-text">{formatNGN(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-muted">Total</span>
                  <span className="font-display text-xl font-bold text-teal">{formatNGN(total)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p className="text-text-soft text-sm font-medium mb-2">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "card", "transfer", "mobile_wallet"] as PayMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        method === m
                          ? "bg-teal/10 border-teal text-teal"
                          : "border-border text-muted hover:border-teal/50"
                      }`}
                    >
                      {m === "cash" ? "💵 Cash" : m === "card" ? "💳 Card" : m === "transfer" ? "🏦 Transfer" : "📱 Mobile"}
                    </button>
                  ))}
                </div>
              </div>

              {method !== "cash" && (
                <div>
                  <label className="block text-text-soft text-sm font-medium mb-1.5">
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
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cashConfirmed}
                    onChange={(e) => setCashConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal"
                  />
                  <span className="text-text-soft text-sm">Cash received — {formatNGN(total)}</span>
                </label>
              )}

              <button
                onClick={processPayment}
                disabled={processing || (method === "cash" && !cashConfirmed)}
                className="btn-teal w-full"
              >
                {processing ? "Processing…" : `Confirm Payment · ${formatNGN(total)}`}
              </button>

              <button onClick={() => setSelected(null)} className="btn-ghost w-full text-sm">
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
