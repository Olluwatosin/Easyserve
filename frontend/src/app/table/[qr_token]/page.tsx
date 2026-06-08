"use client";

import { use, useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useOrderStore } from "@/stores/order";
import { formatNGN } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Bell, ChevronDown, ChevronUp } from "lucide-react";
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
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart } = useOrderStore();
  const router = useRouter();
  const sessionToken = useRef(getOrCreateSession());

  useEffect(() => {
    const params = sessionToken.current ? `?session_token=${sessionToken.current}` : "";
    api
      .get(`/customer/menu/${qr_token}${params}`)
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
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to place order";
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
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeItems =
    menu.categories.find((c) => c.id === activeCategory)?.items ?? [];

  return (
    <div className="min-h-screen bg-bg pb-32">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold text-text">{menu.venue_name}</h1>
            <p className="text-muted text-xs">Tap items to add to order</p>
          </div>
          <button
            onClick={() => setAlertOpen(true)}
            className="p-2.5 bg-amber/10 text-amber rounded-xl"
          >
            <Bell size={18} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {menu.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-teal text-bg"
                  : "bg-bg-card text-muted hover:text-teal"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Reorder suggestions */}
      {menu.suggestions && menu.suggestions.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-muted text-xs font-medium mb-2">Order again?</p>
          <div className="flex gap-2 flex-wrap">
            {menu.suggestions.map((s) => {
              const item = menu.categories.flatMap((c) => c.items).find((i) => i.id === s.menu_item_id);
              if (!item) return null;
              return (
                <button
                  key={s.menu_item_id}
                  onClick={() => addToCart({ menu_item_id: item.id, name: item.name, price: item.effective_price, item_type: item.item_type })}
                  className="flex items-center gap-2 bg-bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-text hover:border-teal/50 transition-colors"
                >
                  <span>{s.name}</span>
                  <span className="text-teal font-semibold">+</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Menu items */}
      <div className="px-4 py-4 space-y-3">
        {activeItems.map((item) => {
          const inCart = cart.find((c) => c.menu_item_id === item.id);
          return (
            <div
              key={item.id}
              className={`card flex items-center gap-4 ${
                !item.is_available ? "opacity-50" : ""
              }`}
            >
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-text font-medium text-sm">{item.name}</p>
                    {item.description && (
                      <p className="text-muted text-xs mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-teal font-semibold text-sm">
                      {formatNGN(item.effective_price)}
                    </p>
                    {item.effective_price < item.original_price && (
                      <p className="text-muted text-xs line-through">
                        {formatNGN(item.original_price)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {item.is_available && (
                <div className="flex-shrink-0">
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 bg-bg-hover rounded-lg flex items-center justify-center text-muted hover:text-teal"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-text text-sm font-semibold w-4 text-center">
                        {inCart.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 bg-teal/10 rounded-lg flex items-center justify-center text-teal"
                      >
                        <Plus size={14} />
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
                      className="w-8 h-8 bg-teal/10 rounded-lg flex items-center justify-center text-teal hover:bg-teal/20"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cart button */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full btn-teal flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} />
              <span>{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            </div>
            <span className="font-bold">{formatNGN(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="relative bg-bg-surface rounded-t-2xl border-t border-border p-5 animate-slide-up max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-text">Your Order</h2>
              <button onClick={() => setCartOpen(false)} className="text-muted">
                <ChevronDown size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {cart.map((item) => (
                <div key={item.menu_item_id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-text text-sm">{item.name}</p>
                    <p className="text-muted text-xs">{formatNGN(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.menu_item_id, -1)}
                      className="w-7 h-7 bg-bg-hover rounded-lg flex items-center justify-center text-muted"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-text text-sm font-medium w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.menu_item_id, 1)}
                      className="w-7 h-7 bg-teal/10 rounded-lg flex items-center justify-center text-teal"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <p className="text-text text-sm font-semibold w-16 text-right">
                    {formatNGN(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted">Total</span>
                <span className="font-display text-xl font-bold text-teal">
                  {formatNGN(cartTotal)}
                </span>
              </div>
              <button
                onClick={placeOrder}
                disabled={placing}
                className="btn-teal w-full"
              >
                {placing ? "Placing order…" : "Place Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert sheet */}
      {alertOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAlertOpen(false)} />
          <div className="relative bg-bg-surface rounded-t-2xl border-t border-border p-5 animate-slide-up">
            <h2 className="font-display text-lg font-bold text-text mb-2">Call Attendant</h2>
            <p className="text-muted text-sm mb-5">
              Tap below to notify your attendant. They will come to your table shortly.
            </p>
            <button onClick={sendAlert} className="btn-teal w-full">
              <Bell size={16} className="inline mr-2" />
              Call Attendant
            </button>
            <button
              onClick={() => setAlertOpen(false)}
              className="btn-outline w-full mt-3"
            >
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
