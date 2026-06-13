"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getRoleHome } from "@/components/AuthGuard";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

const HERO =
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1400&q=85";

const FEATURES = [
  { label: "Orders", value: "Managed live" },
  { label: "Payments", value: "Instant" },
  { label: "Analytics", value: "Real-time" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const { login, loading } = useAuthStore();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      const user = useAuthStore.getState().user!;
      router.replace(getRoleHome(user.role));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Login failed";
      toast.error(msg);
    }
  }

  return (
    <main className="min-h-screen flex bg-bg overflow-hidden">
      {/* ── Left hero panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[56%] relative flex-shrink-0">
        <Image
          src={HERO}
          alt="Luxury lounge bar"
          fill
          className="object-cover"
          priority
          sizes="56vw"
        />
        {/* Dark gradient overlays */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,212,180,0.12) 0%, rgba(8,13,20,0.55) 55%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(8,13,20,0.92) 0%, rgba(8,13,20,0.1) 45%, transparent 100%)",
          }}
        />

        {/* Content on image */}
        <div className="relative flex flex-col justify-between h-full p-12 z-10">
          {/* Top: wordmark */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm"
              style={{
                background: "rgba(0,212,180,0.18)",
                border: "1px solid rgba(0,212,180,0.35)",
                color: "var(--teal)",
              }}
            >
              ES
            </div>
            <span className="font-display text-xl font-bold text-white">
              EasyServe
            </span>
          </div>

          {/* Bottom: tagline + stats */}
          <div>
            <p className="font-display text-[2.6rem] font-bold text-white leading-[1.15] mb-3">
              Where luxury<br />meets service.
            </p>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              The all-in-one hospitality OS for Africa&apos;s finest nightlife venues.
            </p>

            <div className="flex gap-8 mt-8">
              {FEATURES.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-white/35 text-xs uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-teal text-sm font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex-1 relative flex items-center justify-center px-6 py-12">
        {/* Mobile background fallback */}
        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <Image
            src={HERO}
            alt=""
            fill
            className="object-cover opacity-20 scale-105 blur-sm"
            sizes="100vw"
          />
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,13,20,0.88)" }}
          />
        </div>

        <div className="relative w-full max-w-[390px] animate-fade-in">
          {/* Mobile-only logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,212,180,0.14) 0%, rgba(0,168,143,0.06) 100%)",
                border: "1px solid rgba(0,212,180,0.22)",
                boxShadow: "0 0 32px rgba(0,212,180,0.12)",
              }}
            >
              <span className="font-display text-xl font-bold text-teal">ES</span>
            </div>
            <h1
              className="font-display text-2xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              EasyServe
            </h1>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <h2
              className="font-display text-3xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Welcome back
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              Sign in to your EasyServe account
            </p>
          </div>

          {/* Card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: "#111827",
              border: "1px solid #1E2D42",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.025), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-soft)" }}
              >
                Email
              </label>
              <input
                className="input"
                type="email"
                placeholder="you@venue.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-soft)" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  className="input pr-11"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                  style={{ color: "var(--muted)" }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-teal w-full mt-1">
              {loading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full"
                    style={{ animation: "spin-custom 0.7s linear infinite" }}
                  />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "var(--muted)" }}>
            New venue?{" "}
            <a href="/register" className="text-teal hover:underline font-medium">
              Register here
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
