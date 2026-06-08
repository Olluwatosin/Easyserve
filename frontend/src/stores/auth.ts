import { create } from "zustand";
import { api } from "@/lib/api";

export type UserRole = "owner" | "attendant" | "bartender" | "kitchen" | "cashier" | "security";

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  venue_id: string;
  zone: string | null;
  is_active: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      const me = await api.get("/auth/me");
      set({ user: me.data, loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null });
  },

  fetchMe: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
