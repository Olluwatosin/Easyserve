"use client";

import { use, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useOrderStore } from "@/stores/order";
import { formatNGN } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Bell, X, Tag } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

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
  categories: Category[];
  suggestions?: Suggestion[];
}

// ── Curated luxury lounge images ─────────────────────────────────────────────

const DRINK_IMAGES = [
  "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1582819509237-d5b75f20ff7e?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&q=80",
];

const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
];

const OTHER_IMAGES = [
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
];

function getItemImage(item: MenuItem): string {
  if (item.image_url) return item.image_url;
  const pool =
    item.item_type === "drink"
      ? DRINK_IMAGES
      : item.item_type === "food"
      ? FOOD_IMAGES
      : OTHER_IMAGES;
  const seed = item.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return pool[seed % pool.length];
}

const TYPE_ACCENT: Record<string, string> = {
  drink: "#00D4B4",
  food: "#FF9500",
  other: "#6B7A99",
};

// ── Item image component with error fallback ──────────────────────────────────

function ItemImage({ item }: { item: MenuItem }) {
  const [error, setError] = useState(false);
  const src = getItemImage(item);
  const accent = TYPE_ACCENT[item.item_type];
  const emoji =
    item.item_type === "drink" ? "🍹" : item.item_type === "food" ? "🍽️" : "✨";

  if (error) {
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
      src={src}
      alt={item.name}
      fill
      className="object-cover"
      onError={() => setError(true)}
      sizes="96px"
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerMenuPage({
  params,
}: {
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = use(params);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
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
      const { data } = await api.post(`/customer/orders/${qr_token}`, {
        session_token: sessionToken.current,
        items: cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          notes: c.notes,
        })),
      });
      clearCart();
      setCartOpen(false);
      toast.success("Order placed!");
      router.push(`/bill/${data.session_token}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to place order";
      toast.error(msg);
    } finally {
      setPlacing(false);
    }
  }

  async function sendAlert() {
    try {
      await api.post(`/customer/alerts/${qr_token}`, { type: "call_attendant" });
      toast.success("Attendant notified!");
      setAlertOpen(false);
    } catch {
      toast.error("Could not send alert");
    }
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div
          className="w-9 h-9 border-2 border-teal border-t-transparent rounded-full"
          style={{ animation: "spin-custom 0.7s linear infinite" }}
        />
      </div>
    );
  }

  const activeItems = menu.categories.find((c) => c.id === activeCategory)?.items ?? [];

  return (
    <div className="min-h-screen bg-bg pb-28">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 border-b border-border px-4 py-3"
        style={{ background: "rgba(8,13,20,0.93)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1
              className="font-display text-base font-bold leading-none"
              style={{ color: "var(--text)" }}
            >
              {menu.venue_name}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Scan. Order. Enjoy.
            </p>
          </div>
          <button
            onClick={() => setAlertOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: "rgba(255,149,0,0.1)",
              border: "1px solid rgba(255,149,0,0.2)",
              color: "var(--amber)",
            }}
          >
            <Bell size={13} />
            Call Staff
          </button>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {menu.categories.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                style={
                  active
                    ? {
                        background: "var(--teal)",
                        color: "#080D14",
                        boxShadow: "0 0 16px rgba(0,212,180,0.3)",
                      }
                    : {
                        background: "#1A2535",
                        border: "1px solid #1E2D42",
                        color: "var(--muted)",
                      }
                }
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Reorder suggestions ── */}
      {menu.suggestions && menu.suggestions.length > 0 && (
        <div className="px-4 pt-4">
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2.5"
            style={{ color: "var(--muted)" }}
          >
            Order again?
          </p>
          <div className="flex gap-2 flex-wrap">
            {menu.suggestions.map((s) => {
              const item = menu.categories
                .flatMap((c) => c.items)
                .find((i) => i.id === s.menu_item_id);
              if (!item) return null;
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
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{ background: "#1A2535", border: "1px solid #1E2D42", color: "var(--text-soft)" }}
                >
                  {s.name}
                  <span style={{ color: "var(--teal)", fontWeight: 700 }}>+</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Menu items ── */}
      <div className="px-4 py-4 space-y-3">
        {activeItems.map((item) => {
          const inCart = cart.find((c) => c.menu_item_id === item.id);
          const accent = TYPE_ACCENT[item.item_type];
          const hasDiscount = item.effective_price < item.original_price;

          return (
            <div
              key={item.id}
              className="rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                background: "#1A2535",
                border: `1px solid ${inCart ? `${accent}40` : "#1E2D42"}`,
                opacity: item.is_available ? 1 : 0.45,
                boxShadow: inCart ? `0 0 20px ${accent}18` : undefined,
              }}
            >
              <div className="flex gap-0">
                {/* Image */}
                <div className="relative w-24 h-24 flex-shrink-0 overflow-hidden">
                  <ItemImage item={item} />
                  {/* Unavailable overlay */}
                  {!item.is_available && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "rgba(8,13,20,0.7)" }}
                    >
                      <span className="text-xs font-semibold text-muted">Unavailable</span>
                    </div>
                  )}
                  {/* Discount badge */}
                  {hasDiscount && item.is_available && (
                    <div
                      className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: "var(--amber)", color: "#080D14" }}
                    >
                      <Tag size={9} />
                      PROMO
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <p
                        className="font-semibold text-sm leading-snug"
                        style={{ color: "var(--text)" }}
                      >
                        {item.name}
                      </p>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold" style={{ color: accent }}>
                          {formatNGN(item.effective_price)}
                        </p>
                        {hasDiscount && (
                          <p
                            className="text-xs line-through"
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

                  {/* Controls */}
                  {item.is_available && (
                    <div className="flex justify-end mt-2">
                      {inCart ? (
                        <div
                          className="flex items-center gap-0 rounded-xl overflow-hidden"
                          style={{ background: "rgba(36,48,68,0.9)", border: `1px solid ${accent}30` }}
                        >
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-7 flex items-center justify-center transition-colors"
                            style={{ color: "var(--muted)" }}
                          >
                            <Minus size={12} />
                          </button>
                          <span
                            className="text-sm font-bold w-6 text-center tabular-nums"
                            style={{ color: "var(--text)" }}
                          >
                            {inCart.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-7 flex items-center justify-center transition-colors"
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
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            background: `${accent}15`,
                            border: `1px solid ${accent}28`,
                            color: accent,
                          }}
                        >
                          <Plus size={12} />
                          Add
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Cart FAB ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-5 left-4 right-4 z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl font-semibold"
            style={{
              background: "var(--teal)",
              color: "#080D14",
              boxShadow: "0 8px 32px rgba(0,212,180,0.4), 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "rgba(8,13,20,0.22)" }}
              >
                {cartCount}
              </div>
              <span>View Order</span>
            </div>
            <span className="font-bold">{formatNGN(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ── Cart sheet ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
          />
          <div
            className="relative rounded-t-3xl border-t border-border p-5 animate-slide-up max-h-[85vh] flex flex-col"
            style={{ background: "#111827" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2
                  className="font-display text-lg font-bold leading-none"
                  style={{ color: "var(--text)" }}
                >
                  Your Order
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {cartCount} item{cartCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: "var(--muted)", background: "rgba(36,48,68,0.6)" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-5">
              {cart.map((item) => {
                const accent = TYPE_ACCENT[item.item_type] ?? "var(--muted)";
                return (
                  <div
                    key={item.menu_item_id}
                    className="flex items-center gap-3 rounded-xl p-3"
                    style={{ background: "rgba(26,37,53,0.9)" }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: accent }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {item.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {formatNGN(item.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQuantity(item.menu_item_id, -1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(36,48,68,0.9)", color: "var(--muted)" }}
                      >
                        <Minus size={11} />
                      </button>
                      <span
                        className="text-sm font-bold w-5 text-center tabular-nums"
                        style={{ color: "var(--text)" }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.menu_item_id, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(0,212,180,0.12)", color: "var(--teal)" }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <p
                      className="text-sm font-bold w-16 text-right tabular-nums"
                      style={{ color: "var(--text)" }}
                    >
                      {formatNGN(item.price * item.quantity)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Total + CTA */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  Total
                </span>
                <span className="font-display text-2xl font-bold gradient-text">
                  {formatNGN(cartTotal)}
                </span>
              </div>
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
                    Placing order…
                  </>
                ) : (
                  "Place Order"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Alert sheet ── */}
      {alertOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setAlertOpen(false)}
          />
          <div
            className="relative rounded-t-3xl border-t border-border p-6 animate-slide-up space-y-4"
            style={{ background: "#111827" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.2)" }}
              >
                <Bell size={18} className="text-amber" />
              </div>
              <div>
                <h2
                  className="font-display text-lg font-bold leading-none"
                  style={{ color: "var(--text)" }}
                >
                  Call Attendant
                </h2>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                  They&apos;ll come to your table shortly
                </p>
              </div>
            </div>
            <button onClick={sendAlert} className="btn-teal w-full">
              <Bell size={15} />
              Notify Attendant
            </button>
            <button onClick={() => setAlertOpen(false)} className="btn-outline w-full">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  let s = localStorage.getItem("session_token");
  if (!s) {
    s = crypto.randomUUID();
    localStorage.setItem("session_token", s);
  }
  return s;
}
