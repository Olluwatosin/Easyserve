"use client";

import { use, useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { formatNGN, timeAgo } from "@/lib/utils";
import { CheckCircle, Clock, Star, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";
import { QRCodeSVG } from "qrcode.react";

const STATUS_COLOR: Record<string, string> = {
  pending: "#FF9500",
  preparing: "#FF9500",
  ready: "#00D4B4",
  delivered: "#00D4B4",
  paid: "#00D4B4",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  paid: "Paid",
};

interface OrderData {
  id: string;
  status: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    status: string;
    item_type?: string;
  }>;
  created_at: string;
}

interface ExitPass {
  token: string;
  status: "valid" | "expired" | "used";
  expires_at: string;
}

export default function BillPage({
  params,
}: {
  params: Promise<{ session_token: string }>;
}) {
  const { session_token } = use(params);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [exitPass, setExitPass] = useState<ExitPass | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  function load() {
    api.get(`/customer/orders/${session_token}`).then((r) => setOrders(r.data));
    api
      .get(`/customer/exit-pass/${session_token}`)
      .then((r) => setExitPass(r.data))
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/customer/${session_token}`
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (
        msg.event === "payment_confirmed" ||
        msg.event === "exit_pass_ready"
      ) {
        load();
        toast.success("Payment confirmed! Your exit pass is ready.");
      }
    };
    return () => ws.close();
  }, [session_token]);

  const total = orders
    .flatMap((o) => o.items)
    .reduce((s, i) => s + i.price * i.quantity, 0);
  const allPaid =
    orders.length > 0 && orders.every((o) => o.status === "paid");

  async function submitFeedback() {
    if (!rating) return;
    const paidOrder = orders.find((o) => o.status === "paid");
    try {
      await api.post(`/customer/feedback/${paidOrder?.id ?? ""}`, {
        rating,
        comment: comment || null,
      });
      toast.success("Thank you for your feedback!");
      setFeedbackOpen(false);
    } catch {
      toast.error("Could not submit feedback");
    }
  }

  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--bg)" }}>

      {/* ── Hero header ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0A1520 0%, #080D14 100%)",
          borderBottom: "1px solid #1E2D42",
        }}
      >
        {/* Subtle food/cocktail strip */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=60')",
          }}
        />
        <div className="relative z-10 px-5 py-6">
          <EsLogo size={36} className="mb-4" />
          <p
            className="font-display text-2xl font-bold"
            style={{ color: "var(--text)" }}
          >
            {allPaid ? "Your Night, Settled ✓" : "Your Bill"}
          </p>
          {orders[0] && (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {timeAgo(orders[0].created_at)}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">

        {/* ── Order items ── */}
        {orders.map((order) => (
          <div
            key={order.id}
            className="rounded-2xl overflow-hidden"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid #1E2D42" }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                Order
              </span>
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize"
                style={{
                  background: `${STATUS_COLOR[order.status] ?? "#6B7A99"}15`,
                  color: STATUS_COLOR[order.status] ?? "#6B7A99",
                }}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>

            <div
              className="divide-y"
              style={{ borderColor: "#1E2D42" }}
            >
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {item.item_type === "drink" ? "🍸" : "🍽️"}
                    </span>
                    <span style={{ color: "var(--text-soft)" }}>
                      {item.quantity}× {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className="text-xs capitalize"
                      style={{
                        color: STATUS_COLOR[item.status] ?? "var(--muted)",
                      }}
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    <span className="font-medium" style={{ color: "var(--text)" }}>
                      {formatNGN(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── Total ── */}
        {orders.length > 0 && (
          <div
            className="rounded-2xl px-5 py-4 flex items-center justify-between"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,212,180,0.06) 0%, rgba(0,144,107,0.03) 100%)",
              border: "1px solid rgba(0,212,180,0.2)",
            }}
          >
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--muted)" }}
            >
              Total
            </span>
            <span className="font-display text-3xl font-bold gradient-text">
              {formatNGN(total)}
            </span>
          </div>
        )}

        {/* ── Awaiting payment notice ── */}
        {!allPaid && orders.length > 0 && (
          <div
            className="rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{
              background: "rgba(255,149,0,0.05)",
              border: "1px solid rgba(255,149,0,0.2)",
            }}
          >
            <Clock
              size={16}
              style={{ color: "var(--amber)", flexShrink: 0 }}
            />
            <p className="text-sm" style={{ color: "var(--text-soft)" }}>
              Visit the cashier to complete your payment and collect your exit
              pass.
            </p>
          </div>
        )}

        {/* ── Exit Pass ── */}
        {exitPass && (
          <div
            className="rounded-3xl overflow-hidden"
            style={{
              background: "#111827",
              border:
                exitPass.status === "valid"
                  ? "2px solid rgba(0,212,180,0.5)"
                  : exitPass.status === "used"
                  ? "2px solid #1E2D42"
                  : "2px solid rgba(248,113,113,0.4)",
            }}
          >
            {/* Pass header */}
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{
                background:
                  exitPass.status === "valid"
                    ? "rgba(0,212,180,0.06)"
                    : "rgba(26,37,53,0.5)",
                borderBottom:
                  exitPass.status === "valid"
                    ? "1px solid rgba(0,212,180,0.2)"
                    : "1px solid #1E2D42",
              }}
            >
              <div>
                <p
                  className="font-display font-bold text-sm"
                  style={{ color: "var(--text)" }}
                >
                  Exit Pass
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    color:
                      exitPass.status === "valid"
                        ? "var(--teal)"
                        : exitPass.status === "used"
                        ? "var(--muted)"
                        : "#f87171",
                  }}
                >
                  {exitPass.status === "valid"
                    ? "Valid — show to security at the exit"
                    : exitPass.status === "used"
                    ? "Already scanned"
                    : "Expired — see cashier"}
                </p>
              </div>
              {exitPass.status === "valid" && (
                <CheckCircle size={20} className="text-teal" />
              )}
            </div>

            {/* QR code */}
            {exitPass.status === "valid" && (
              <div className="p-6 flex flex-col items-center gap-4">
                <div
                  className="p-4 rounded-2xl animate-glow-teal"
                  style={{
                    background: "#1A2535",
                    border: "1px solid rgba(0,212,180,0.3)",
                  }}
                >
                  <QRCodeSVG
                    value={exitPass.token}
                    size={180}
                    bgColor="#1A2535"
                    fgColor="#00D4B4"
                    level="M"
                  />
                </div>
                <p
                  className="text-xs text-center"
                  style={{ color: "var(--muted)" }}
                >
                  Present this QR code to security at the exit
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Feedback ── */}
        {allPaid && !feedbackOpen && (
          <button
            onClick={() => setFeedbackOpen(true)}
            className="w-full rounded-2xl px-5 py-4 flex items-center justify-between transition-all"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "rgba(0,212,180,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "#1E2D42";
            }}
          >
            <div className="flex items-center gap-3">
              <Star size={18} style={{ color: "var(--amber)" }} />
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-soft)" }}
              >
                Rate your experience
              </span>
            </div>
            <ChevronRight size={16} style={{ color: "var(--muted)" }} />
          </button>
        )}

        {feedbackOpen && (
          <div
            className="rounded-2xl p-5 space-y-5 animate-fade-in"
            style={{ background: "#111827", border: "1px solid #1E2D42" }}
          >
            <p
              className="font-display font-bold text-base"
              style={{ color: "var(--text)" }}
            >
              How was your experience?
            </p>
            <div className="flex gap-3 justify-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="text-3xl transition-all duration-150"
                  style={{
                    transform: n <= rating ? "scale(1.25)" : "scale(0.9)",
                    filter:
                      n <= rating
                        ? "saturate(1) drop-shadow(0 0 8px rgba(255,149,0,0.5))"
                        : "saturate(0) opacity(0.35)",
                  }}
                >
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Any comments? (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              onClick={submitFeedback}
              disabled={!rating}
              className="btn-teal w-full"
            >
              Submit Feedback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
