"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { publicApi as api } from "@/lib/publicApi";
import { useOrderStore } from "@/stores/order";
import { formatNGN } from "@/lib/utils";
import { Plus, Minus, Bell, X, Tag, ChevronRight, Check } from "lucide-react";
import toast from "react-hot-toast";

import { newRequestId } from "@/lib/offline";
import { OfflineBanner, useOffline } from "@/lib/useOffline";
import { WS_URL } from "@/lib/env";
import { useRouter } from "next/navigation";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number;
  effective_price: number;
  item_type: "drink" | "food" | "other";
  is_available: boolean;
  image_url: string | null;
  order_count: number;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface Suggestion {
  menu_item_id: string;
  name: string;
  qty: number;
}

interface MenuData {
  venue_name: string;
  table_label: string;
  categories: Category[];
  suggestions?: Suggestion[];
  active_promos: unknown[];
}

// No stock-photo fallbacks: remote placeholder images burn guest data on 3G
// and look generic. Items without an uploaded photo get a light emoji tile.

const TYPE_ACCENT: Record<string, string> = {
  drink: "#00D4B4",
  food: "#FF9500",
  other: "#6B7A99",
};

// ── Item image component with error fallback ──────────────────────────────────

function ItemImage({ item }: { item: MenuItem }) {
  const [error, setError] = useState(false);
  const accent = TYPE_ACCENT[item.item_type];
  const emoji =
    item.item_type === "drink" ? "🍹" : item.item_type === "food" ? "🍽️" : "✨";

  if (!item.image_url || error) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-2xl"
        style={{ background: `${accent}15` }}
      >
        {emoji}
      </div>
    );
  }

  return (
    <Image
      src={item.image_url}
      alt={item.name}
      fill
      className="object-cover"
      onError={() => setError(true)}
      sizes="96px"
    />
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Hero skeleton */}
      <div
        className="w-full h-52 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(30,45,66,0.8) 0%, rgba(15,25,35,0.9) 100%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(30,45,66,0.5) 0%, rgba(50,65,85,0.3) 50%, rgba(30,45,66,0.5) 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.8s ease-in-out infinite",
          }}
        />
        <div className="absolute inset-0 flex flex-col justify-end p-5 pb-6">
          <div
            className="h-8 w-48 rounded-xl mb-3"
            style={{
              background: "rgba(255,255,255,0.06)",
              animation: "shimmer 1.8s ease-in-out infinite",
            }}
          />
          <div
            className="h-6 w-20 rounded-full"
            style={{
              background: "rgba(255,255,255,0.04)",
              animation: "shimmer 1.8s ease-in-out infinite 0.1s",
            }}
          />
        </div>
      </div>

      {/* Nav skeleton */}
      <div
        className="px-4 py-3 flex gap-2 overflow-hidden"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {[80, 64, 96, 72].map((w, i) => (
          <div
            key={i}
            className="flex-shrink-0 h-8 rounded-full"
            style={{
              width: w,
              background: "rgba(30,45,66,0.8)",
              animation: `shimmer 1.8s ease-in-out infinite ${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      {/* Card skeletons */}
      <div className="px-4 py-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden flex"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              animation: `shimmer-fade 1.8s ease-in-out infinite ${i * 0.1}s`,
            }}
          >
            <div
              className="w-24 h-24 flex-shrink-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(30,45,66,0.5) 0%, rgba(50,65,85,0.3) 50%, rgba(30,45,66,0.5) 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.8s ease-in-out infinite",
              }}
            />
            <div className="flex-1 p-3 flex flex-col justify-between">
              <div>
                <div
                  className="h-4 w-32 rounded-lg mb-2"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                />
                <div
                  className="h-3 w-48 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                />
              </div>
              <div className="flex justify-between items-end">
                <div
                  className="h-4 w-16 rounded-lg"
                  style={{ background: "rgba(0,212,180,0.08)" }}
                />
                <div
                  className="h-7 w-16 rounded-xl"
                  style={{ background: "rgba(0,212,180,0.06)" }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes shimmer-fade {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type AlertType = "call_attendant" | "request_payment" | "order_more";

const ALERT_OPTIONS: { type: AlertType; label: string }[] = [
  { type: "call_attendant", label: "Call an attendant" },
  { type: "request_payment", label: "Bring me the bill" },
  { type: "order_more", label: "I want to order more" },
];

export default function CustomerMenuPage({
  params,
}: {
  params: { qr_token: string };
}) {
  const { qr_token } = params;
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const offline = useOffline();
  const [alertStatus, setAlertStatus] = useState<"idle" | "sent" | string>("idle");
  const [orderSent, setOrderSent] = useState(false);
  const [guestPhone, setGuestPhone] = useState("");

  // Remember the guest's phone across visits (loyalty recognition)

  // The guest already has a session; connecting it here means "notified" can be
  // followed by "Amara is on her way" instead of silence, which is what makes
  // people give up and shout.
  useEffect(() => {
    const token = sessionToken.current;
    if (!token) return;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${WS_URL}/ws/customer/${token}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "alert_acknowledged" && msg.data?.message) {
            setAlertStatus(msg.data.message);
            toast.success(msg.data.message, { duration: 8000 });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    } catch {
      /* no socket — the alert still reaches staff over HTTP */
    }
    return () => ws?.close();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("guest_phone");
    if (saved) setGuestPhone(saved);
  }, []);
  const { cart, addToCart, updateQuantity, clearCart } = useOrderStore();
  const router = useRouter();
  const sessionToken = useRef(getOrCreateSession());

  useEffect(() => {
    const qs = sessionToken.current ? `?session_token=${sessionToken.current}` : "";
    api
      .get(`/customer/menu/${qr_token}${qs}`)
      .then((r) => {
        setMenu(r.data);
        if (r.data.categories.length > 0) setActiveCategory(r.data.categories[0].id);
      })
      .catch(() => toast.error("Could not load menu"));
  }, [qr_token]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      if (guestPhone) localStorage.setItem("guest_phone", guestPhone);
      // Generated here, before the attempt, so a replay after a dropped
      // connection is recognised as the same order rather than a second one.
      const clientRequestId = newRequestId();
      const { queued, response } = await offline.submit({
        method: "POST",
        url: `/customer/orders/${qr_token}`,
        kind: "order",
        label: `Order for ${cart.length} item${cart.length === 1 ? "" : "s"}`,
        body: {
          client_request_id: clientRequestId,
          session_token: sessionToken.current,
          customer_phone: guestPhone || null,
          items: cart.map((c) => ({
            menu_item_id: c.menu_item_id,
            quantity: c.quantity,
            notes: c.notes,
          })),
        },
      });

      if (!queued && response && !response.ok) {
        const detail = await response.json().catch(() => null);
        toast.error(detail?.detail ?? "Failed to place order");
        return;
      }

      clearCart();
      setOrderSent(true);
      if (queued) {
        toast.success("Saved — it will send when the network returns", { duration: 5000 });
      }
    } catch {
      toast.error("Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  async function sendAlert(type: AlertType = "call_attendant") {
    try {
      await offline.submit({
        method: "POST",
        url: `/customer/alerts/${qr_token}`,
        kind: "alert",
        label: ALERT_OPTIONS.find((o) => o.type === type)?.label ?? "Call attendant",
        body: { type, session_token: sessionToken.current },
      });
      setAlertStatus("sent");
      toast.success("Sent — someone will come over");
      setAlertOpen(false);
    } catch {
      toast.error("Could not send alert");
    }
  }

  if (!menu) {
    return <LoadingSkeleton />;
  }

  const activeCategory_ = menu.categories.find((c) => c.id === activeCategory);
  const activeItems = activeCategory_?.items ?? [];
  const availableItems = activeItems.filter((i) => i.is_available);
  const unavailableItems = activeItems.filter((i) => !i.is_available);
  const orderedItems = [...availableItems, ...unavailableItems];

  return (
    <div className="min-h-screen pb-28" style={{ background: "var(--bg)" }}>
      <OfflineBanner state={offline} />
      {alertStatus !== "idle" && alertStatus !== "sent" && (
        <div
          className="fixed top-0 inset-x-0 z-50 px-4 py-2.5 text-sm text-center font-medium"
          style={{
            background: "rgba(0,212,180,0.16)",
            borderBottom: "1px solid rgba(0,212,180,0.4)",
            color: "var(--teal)",
            backdropFilter: "blur(8px)",
          }}
        >
          {alertStatus}
        </div>
      )}

      {/* ── Hero header (non-sticky) ── */}
      <div className="relative w-full h-52 overflow-hidden">
        {/* Gradient backdrop — no remote hero image; guests are on mobile data */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0E1B2A 0%, #080D14 55%), radial-gradient(ellipse at 80% 20%, rgba(0,212,180,0.25) 0%, transparent 55%)",
            backgroundBlendMode: "screen",
          }}
        />
        {/* Dark gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,13,20,0.45) 0%, rgba(8,13,20,0.72) 60%, rgba(8,13,20,0.95) 100%)",
          }}
        />
        {/* Side vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(8,13,20,0.55) 100%)",
          }}
        />

        {/* Call Staff button — top right */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setAlertOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: "rgba(255,149,0,0.15)",
              border: "1px solid rgba(255,149,0,0.3)",
              color: "var(--amber)",
              backdropFilter: "blur(12px)",
            }}
          >
            <Bell size={13} />
            Call Staff
          </button>
        </div>

        {/* Venue info — bottom left */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 animate-fade-in">
          <h1
            className="font-display font-bold leading-tight mb-2"
            style={{ color: "var(--text)", fontSize: "clamp(22px, 6vw, 32px)" }}
          >
            {menu.venue_name}
          </h1>
          {menu.table_label && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: "rgba(0,212,180,0.18)",
                border: "1px solid rgba(0,212,180,0.35)",
                color: "var(--teal)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--teal)" }}
              />
              {menu.table_label}
            </span>
          )}
        </div>
      </div>

      {/* ── Sticky category nav ── */}
      <div
        className="sticky top-0 z-10 px-4 py-3"
        style={{
          background: "rgba(8,13,20,0.93)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {menu.categories.map((cat) => {
            const active = activeCategory === cat.id;
            const count = cat.items.filter((i) => i.is_available).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
                style={
                  active
                    ? {
                        background: "var(--teal)",
                        color: "#080D14",
                        boxShadow: "0 0 20px rgba(0,212,180,0.4), 0 0 8px rgba(0,212,180,0.2)",
                      }
                    : {
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: "var(--muted)",
                      }
                }
              >
                {cat.name}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: active ? "rgba(8,13,20,0.22)" : "rgba(255,255,255,0.06)",
                    color: active ? "#080D14" : "var(--muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Re-order suggestions strip ── */}
      {menu.suggestions && menu.suggestions.length > 0 && (
        <div className="px-4 pt-5 animate-fade-in">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--muted)" }}
          >
            Order again?
          </p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {menu.suggestions.map((s) => {
              const item = menu.categories
                .flatMap((c) => c.items)
                .find((i) => i.id === s.menu_item_id);
              if (!item) return null;
              const accent = TYPE_ACCENT[item.item_type];
              return (
                <button
                  key={s.menu_item_id}
                  onClick={() =>
                    addToCart({
                      menu_item_id: item.id,
                      name: item.name,
                      price: item.effective_price,
                      item_type: item.item_type,
                    })
                  }
                  className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-medium transition-all"
                  style={{
                    background: "var(--bg-card)",
                    border: `1px solid ${accent}28`,
                    color: "var(--text-soft)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: accent }}
                  />
                  {s.name}
                  <Plus size={10} style={{ color: accent }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Menu items ── */}
      <div className="px-4 py-4 space-y-3">
        {orderedItems.length === 0 ? (
          /* Empty category state */
          <div
            className="rounded-2xl p-8 text-center animate-fade-in"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl"
              style={{ background: "rgba(107,122,153,0.1)" }}
            >
              🍽️
            </div>
            <p
              className="font-display font-semibold text-base mb-1"
              style={{ color: "var(--text)" }}
            >
              Nothing here yet
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              This category has no available items right now.
            </p>
          </div>
        ) : (
          orderedItems.map((item, idx) => {
            const inCart = cart.find((c) => c.menu_item_id === item.id);
            const accent = TYPE_ACCENT[item.item_type];
            const hasDiscount = item.effective_price < item.original_price;

            return (
              <div
                key={item.id}
                className="group rounded-2xl overflow-hidden transition-all duration-250 animate-fade-in"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${inCart ? `${accent}45` : "var(--border)"}`,
                  opacity: item.is_available ? 1 : 0.48,
                  boxShadow: inCart
                    ? `0 0 24px ${accent}18, 0 4px 16px rgba(0,0,0,0.3)`
                    : "0 2px 8px rgba(0,0,0,0.2)",
                  transform: "translateY(0)",
                  animationDelay: `${idx * 40}ms`,
                  animationFillMode: "both",
                }}
                onMouseEnter={(e) => {
                  if (item.is_available) {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = inCart
                      ? `0 8px 32px ${accent}28, 0 0 0 1px ${accent}30`
                      : `0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,212,180,0.08)`;
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = inCart
                    ? `0 0 24px ${accent}18, 0 4px 16px rgba(0,0,0,0.3)`
                    : "0 2px 8px rgba(0,0,0,0.2)";
                }}
              >
                <div className="flex gap-0">
                  {/* Image — left side, square, rounded corners only on left */}
                  <div
                    className="relative w-24 h-24 flex-shrink-0 overflow-hidden"
                    style={{ borderRadius: "0" }}
                  >
                    <ItemImage item={item} />

                    {/* Sold out overlay */}
                    {!item.is_available && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: "rgba(8,13,20,0.75)" }}
                      >
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                          style={{
                            background: "rgba(107,122,153,0.25)",
                            color: "var(--muted)",
                            border: "1px solid rgba(107,122,153,0.2)",
                          }}
                        >
                          Sold out
                        </span>
                      </div>
                    )}

                    {/* PROMO badge */}
                    {hasDiscount && item.is_available && (
                      <div
                        className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "var(--amber)", color: "#080D14" }}
                      >
                        <Tag size={8} />
                        PROMO
                      </div>
                    )}
                  </div>

                  {/* Content — right side */}
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className="font-semibold text-sm leading-snug flex-1"
                          style={{ color: "var(--text)" }}
                        >
                          {item.name}
                        </p>
                        {/* Price block */}
                        <div className="flex-shrink-0 text-right">
                          <p
                            className="text-sm font-bold tabular-nums"
                            style={{ color: accent }}
                          >
                            {formatNGN(item.effective_price)}
                          </p>
                          {hasDiscount && (
                            <p
                              className="text-[11px] line-through tabular-nums"
                              style={{ color: "var(--muted)" }}
                            >
                              {formatNGN(item.original_price)}
                            </p>
                          )}
                        </div>
                      </div>

                      {item.description && (
                        <p
                          className="text-xs mt-0.5 line-clamp-2 leading-relaxed"
                          style={{ color: "var(--muted)" }}
                        >
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Cart controls */}
                    {item.is_available && (
                      <div className="flex justify-end mt-2">
                        {inCart ? (
                          <div
                            className="flex items-center rounded-xl overflow-hidden"
                            style={{
                              background: "rgba(26,37,53,0.9)",
                              border: `1px solid ${accent}35`,
                              boxShadow: `0 0 12px ${accent}18`,
                            }}
                          >
                            <button
                              onClick={() => updateQuantity(item.id, -1)}
                              className="w-8 h-7 flex items-center justify-center transition-colors hover:opacity-70"
                              style={{ color: "var(--muted)" }}
                            >
                              <Minus size={12} />
                            </button>
                            <span
                              className="text-sm font-bold w-7 text-center tabular-nums"
                              style={{ color: "var(--text)" }}
                            >
                              {inCart.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-8 h-7 flex items-center justify-center transition-colors hover:opacity-70"
                              style={{ color: accent }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              addToCart({
                                menu_item_id: item.id,
                                name: item.name,
                                price: item.effective_price,
                                item_type: item.item_type,
                              })
                            }
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                            style={{
                              background: `${accent}12`,
                              border: `1px solid ${accent}25`,
                              color: accent,
                            }}
                          >
                            <Plus size={11} />
                            Add
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Cart FAB ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-5 left-4 right-4 z-20 animate-slide-up">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl font-semibold transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #00D4B4 0%, #00B89C 100%)",
              color: "#080D14",
              boxShadow: "0 8px 32px rgba(0,212,180,0.45), 0 2px 12px rgba(0,0,0,0.5)",
            }}
          >
            {/* Left: item count circle */}
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "rgba(8,13,20,0.25)" }}
              >
                {cartCount}
              </div>
              <span className="font-bold text-sm tracking-wide">Review Order</span>
            </div>

            {/* Right: total */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tabular-nums">{formatNGN(cartTotal)}</span>
              <ChevronRight size={16} style={{ opacity: 0.7 }} />
            </div>
          </button>
        </div>
      )}

      {/* ── Cart bottom sheet ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            style={{ backdropFilter: "blur(6px)" }}
            onClick={() => setCartOpen(false)}
          />

          {/* Sheet */}
          <div
            className="relative rounded-t-3xl p-5 animate-slide-up max-h-[88vh] flex flex-col"
            style={{
              background: "#0F1923",
              border: "1px solid var(--border)",
              borderBottom: "none",
              boxShadow: "0 -24px 64px rgba(0,0,0,0.7)",
            }}
          >
            {/* Drag handle */}
            <div
              className="w-10 h-1 rounded-full mx-auto mb-5"
              style={{ background: "var(--border)" }}
            />

            {/* Sheet header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2
                  className="font-display text-xl font-bold leading-none"
                  style={{ color: "var(--text)" }}
                >
                  Your Order
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {cartCount} item{cartCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{
                  background: "rgba(30,45,66,0.8)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Cart items list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 no-scrollbar">
              {cart.map((item) => {
                const accent = TYPE_ACCENT[item.item_type] ?? "var(--muted)";
                return (
                  <div
                    key={item.menu_item_id}
                    className="flex items-center gap-3 rounded-2xl p-3.5"
                    style={{
                      background: "rgba(26,37,53,0.9)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {/* Dot accent */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: accent }}
                    />

                    {/* Name + each price */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {item.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {formatNGN(item.price)} each
                      </p>
                    </div>

                    {/* Qty stepper */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.menu_item_id, -1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{
                          background: "rgba(36,48,68,0.9)",
                          border: "1px solid var(--border)",
                          color: "var(--muted)",
                        }}
                      >
                        <Minus size={11} />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center tabular-nums"
                        style={{ color: "var(--text)" }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.menu_item_id, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{
                          background: "rgba(0,212,180,0.1)",
                          border: "1px solid rgba(0,212,180,0.2)",
                          color: "var(--teal)",
                        }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <p
                      className="text-sm font-bold w-16 text-right tabular-nums flex-shrink-0"
                      style={{ color: "var(--text)" }}
                    >
                      {formatNGN(item.price * item.quantity)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Separator */}
            <div
              className="h-px w-full mb-4"
              style={{ background: "var(--border)" }}
            />

            {/* Total + CTA */}
            {orderSent ? (
              /* Success state */
              <div className="space-y-3 animate-fade-in">
                <div
                  className="rounded-2xl p-5 text-center"
                  style={{
                    background: "rgba(0,212,180,0.06)",
                    border: "1px solid rgba(0,212,180,0.2)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{
                      background: "rgba(0,212,180,0.12)",
                      border: "1px solid rgba(0,212,180,0.25)",
                    }}
                  >
                    <Check size={22} style={{ color: "var(--teal)" }} />
                  </div>
                  <p className="font-display font-bold text-base mb-1" style={{ color: "var(--teal)" }}>
                    Sent to kitchen!
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Your order is being prepared
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOrderSent(false);
                    setCartOpen(false);
                  }}
                  className="btn-teal w-full"
                >
                  Add More Items
                </button>
                <button
                  onClick={() => router.push(`/bill/${sessionToken.current}`)}
                  className="btn-outline w-full"
                >
                  View My Bill
                </button>
              </div>
            ) : (
              /* Normal checkout state */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    Total
                  </span>
                  <span className="font-display text-2xl font-bold gradient-text tabular-nums">
                    {formatNGN(cartTotal)}
                  </span>
                </div>
                <input
                  type="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="Phone number (optional — for your receipt)"
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--fg, #fff)",
                  }}
                />
                <button
                  onClick={placeOrder}
                  disabled={placing}
                  className="btn-teal w-full"
                >
                  {placing ? (
                    <>
                      <span
                        className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full"
                        style={{ animation: "spin-custom 0.7s linear infinite" }}
                      />
                      Placing order&hellip;
                    </>
                  ) : (
                    "Place Order"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Call Staff bottom sheet ── */}
      {alertOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            style={{ backdropFilter: "blur(6px)" }}
            onClick={() => setAlertOpen(false)}
          />

          {/* Sheet */}
          <div
            className="relative rounded-t-3xl p-6 animate-slide-up"
            style={{
              background: "#0F1923",
              border: "1px solid rgba(255,149,0,0.15)",
              borderBottom: "none",
              boxShadow: "0 -24px 64px rgba(0,0,0,0.7), 0 -8px 32px rgba(255,149,0,0.08)",
            }}
          >
            {/* Drag handle */}
            <div
              className="w-10 h-1 rounded-full mx-auto mb-6"
              style={{ background: "rgba(255,149,0,0.25)" }}
            />

            {/* Icon + heading */}
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center animate-glow-amber flex-shrink-0"
                style={{
                  background: "rgba(255,149,0,0.12)",
                  border: "1px solid rgba(255,149,0,0.25)",
                }}
              >
                <Bell size={20} style={{ color: "var(--amber)" }} />
              </div>
              <div>
                <h2
                  className="font-display text-xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  Call Attendant
                </h2>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                  A staff member will come to your table
                </p>
              </div>
            </div>

            <p
              className="text-sm mb-6 leading-relaxed"
              style={{ color: "var(--text-soft)" }}
            >
              Need assistance? Tap below and our team will be with you shortly. No waiting, no shouting.
            </p>

            {/* The three reasons people actually wave at staff. "Bring the bill"
                was already supported by the API and had no way to be sent. */}
            <div className="space-y-2.5 mb-3">
              {ALERT_OPTIONS.map((opt, i) => (
                <button
                  key={opt.type}
                  onClick={() => sendAlert(opt.type)}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all"
                  style={
                    i === 0
                      ? {
                          background: "linear-gradient(135deg, #FF9500 0%, #FFB347 100%)",
                          color: "#080D14",
                          boxShadow:
                            "0 8px 24px rgba(255,149,0,0.4), 0 2px 8px rgba(0,0,0,0.4)",
                        }
                      : {
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.14)",
                          color: "var(--text)",
                        }
                  }
                >
                  <Bell size={16} />
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAlertOpen(false)}
              className="btn-outline w-full"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session helper ────────────────────────────────────────────────────────────

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  let s = localStorage.getItem("session_token");
  if (!s) {
    s = crypto.randomUUID();
    localStorage.setItem("session_token", s);
  }
  return s;
}
