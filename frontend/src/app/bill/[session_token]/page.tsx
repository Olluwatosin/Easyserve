"use client";

import { use, useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { formatNGN, timeAgo } from "@/lib/utils";
import { CheckCircle, Clock, ChevronRight, Star, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";

const STATUS_COLORS: Record<string, string> = {
  pending: "badge-amber",
  preparing: "badge-amber",
  ready: "badge-teal",
  delivered: "badge-teal",
  paid: "badge-teal",
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

    // Customer WebSocket for real-time updates
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/customer/${session_token}`
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "payment_confirmed" || msg.event === "exit_pass_ready") {
        load();
        toast.success("Payment confirmed! Your exit pass is ready.");
      }
    };
    return () => ws.close();
  }, [session_token]);

  const total = orders.flatMap((o) => o.items).reduce((s, i) => s + i.price * i.quantity, 0);
  const allPaid = orders.length > 0 && orders.every((o) => o.status === "paid");

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
    <div className="min-h-screen bg-bg pb-10">
      <header className="bg-bg-surface border-b border-border px-4 py-5">
        <h1 className="font-display text-xl font-bold text-text">Your Bill</h1>
        <p className="text-muted text-xs mt-0.5">{timeAgo(orders[0]?.created_at ?? new Date().toISOString())}</p>
      </header>

      <div className="px-4 py-4 space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-soft text-sm font-medium">Order</span>
              <span className={STATUS_COLORS[order.status] ?? "badge-muted"}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-text-soft">
                    {item.quantity}× {item.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${STATUS_COLORS[item.status] ?? "text-muted"}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    <span className="text-text font-medium">
                      {formatNGN(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Total */}
        {orders.length > 0 && (
          <div className="card flex items-center justify-between">
            <span className="text-muted">Total</span>
            <span className="font-display text-2xl font-bold text-teal">{formatNGN(total)}</span>
          </div>
        )}

        {/* Exit Pass */}
        {exitPass && (
          <div
            className={`card border-2 ${
              exitPass.status === "valid"
                ? "border-teal glow-teal"
                : exitPass.status === "used"
                ? "border-muted"
                : "border-red-500"
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <QrCode
                size={20}
                className={
                  exitPass.status === "valid"
                    ? "text-teal"
                    : exitPass.status === "used"
                    ? "text-muted"
                    : "text-red-400"
                }
              />
              <div>
                <p className="font-display text-sm font-semibold text-text">Exit Pass</p>
                <p
                  className={`text-xs ${
                    exitPass.status === "valid"
                      ? "text-teal"
                      : exitPass.status === "used"
                      ? "text-muted"
                      : "text-red-400"
                  }`}
                >
                  {exitPass.status === "valid"
                    ? "Show this to security to exit"
                    : exitPass.status === "used"
                    ? "Already scanned"
                    : "Expired"}
                </p>
              </div>
            </div>
            {exitPass.status === "valid" && (
              <div className="flex justify-center">
                <QRCodeSVG
                  value={exitPass.token}
                  size={180}
                  bgColor="#1A2535"
                  fgColor="#00D4B4"
                  level="M"
                />
              </div>
            )}
          </div>
        )}

        {/* Feedback button */}
        {allPaid && !feedbackOpen && (
          <button
            onClick={() => setFeedbackOpen(true)}
            className="card w-full flex items-center justify-between hover:border-teal/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Star size={18} className="text-amber" />
              <span className="text-text-soft text-sm">Rate your experience</span>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </button>
        )}

        {feedbackOpen && (
          <div className="card space-y-4">
            <h3 className="font-display font-semibold text-text">How was your experience?</h3>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`text-2xl transition-transform ${
                    n <= rating ? "scale-110" : "opacity-40"
                  }`}
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
            <button onClick={submitFeedback} disabled={!rating} className="btn-teal w-full">
              Submit Feedback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
