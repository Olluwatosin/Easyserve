import { create } from "zustand";
import { api } from "@/lib/api";

export interface OrderItem {
  id: string;
  menu_item_id: string | null;
  name: string;
  quantity: number;
  price: number;
  item_type: "drink" | "food" | "other";
  routed_to: "bar" | "kitchen" | "none";
  status: string;
  notes: string | null;
}

export interface Order {
  id: string;
  venue_id: string;
  table_id: string | null;
  session_token: string | null;
  assigned_to: string | null;
  status: string;
  order_source: string;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

interface CartItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  price: number;
  item_type: "drink" | "food" | "other";
  notes?: string;
}

interface OrderState {
  cart: CartItem[];
  orders: Order[];
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeFromCart: (menu_item_id: string) => void;
  updateQuantity: (menu_item_id: string, delta: number) => void;
  clearCart: () => void;
  fetchOrders: (venueId: string) => Promise<void>;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  cart: [],
  orders: [],

  addToCart: (item) => {
    const { cart } = get();
    const existing = cart.find((c) => c.menu_item_id === item.menu_item_id);
    if (existing) {
      set({
        cart: cart.map((c) =>
          c.menu_item_id === item.menu_item_id
            ? { ...c, quantity: c.quantity + (item.quantity ?? 1) }
            : c
        ),
      });
    } else {
      set({ cart: [...cart, { ...item, quantity: item.quantity ?? 1 }] });
    }
  },

  removeFromCart: (menu_item_id) => {
    set({ cart: get().cart.filter((c) => c.menu_item_id !== menu_item_id) });
  },

  updateQuantity: (menu_item_id, delta) => {
    set({
      cart: get()
        .cart.map((c) =>
          c.menu_item_id === menu_item_id
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0),
    });
  },

  clearCart: () => set({ cart: [] }),

  fetchOrders: async (venueId) => {
    const { data } = await api.get(`/orders?venue_id=${venueId}`);
    set({ orders: data });
  },
}));
