"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getRoleHome } from "@/components/AuthGuard";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";

// Self-hosted gradient backdrop — no third-party image dependency at runtime.
const HERO_BG =
  "radial-gradient(ellipse at 25% 25%, rgba(0,212,180,0.16) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(255,149,0,0.08) 0%, transparent 50%), linear-gradient(160deg, #10202F 0%, #080D14 65%)";

const FEATURES = [
  { label: "Orders", value: "Managed live" },
  { label: "Payments", value: "Instant" },
  { label: "Analytics", value: "Real-time" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
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
        <div className="absolute inset-0" style={{ background: HERO_BG }} />
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
            <EsLogo size={40} variant="glass" />
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
      <div className="flex-1 relative flex items-center justify-center px-6 py-12 overflow-hidden">
        {/* Mobile background fallback */}
        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <div className="absolute inset-0" style={{ background: HERO_BG }} />
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,13,20,0.7)" }}
          />
        </div>

        {/* Desktop: same backdrop continues from left panel */}
        <div
          className="hidden lg:block absolute inset-0"
          style={{ background: HERO_BG }}
        />
        {/* Dark overlay so form stays readable */}
        <div
          className="hidden lg:block absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(8,13,20,0.80) 0%, rgba(8,13,20,0.65) 55%, rgba(8,13,20,0.78) 100%)",
          }}
        />

        <div className="relative z-10 w-full max-w-[390px] animate-fade-in">
          {/* Mobile-only logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <EsLogo size={56} variant="glow-glass" className="mb-4" />
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
              background: "rgba(8,13,20,0.72)",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,212,180,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
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
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="block text-sm font-medium"
                  style={{ color: "var(--text-soft)" }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgot((v) => !v)}
                  className="text-xs transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--teal)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  Forgot password?
                </button>
              </div>
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

            {showForgot && (
              <div
                className="rounded-xl p-4 text-xs space-y-2 animate-fade-in"
                style={{
                  background: "rgba(0,212,180,0.06)",
                  border: "1px solid rgba(0,212,180,0.2)",
                }}
              >
                <p className="font-semibold" style={{ color: "var(--teal)" }}>
                  Password reset
                </p>
                <p style={{ color: "var(--text-soft)" }}>
                  <strong>Venue owner?</strong> Log in and go to{" "}
                  <span style={{ color: "var(--teal)" }}>Settings → Change Password</span>{" "}
                  to update it. If you&apos;re locked out, email{" "}
                  <a href="mailto:support@easyserve.ng" style={{ color: "var(--teal)" }}>
                    support@easyserve.ng
                  </a>
                  .
                </p>
                <p style={{ color: "var(--muted)" }}>
                  <strong>Staff member?</strong> Ask your venue manager to reset your PIN from the Staff page.
                </p>
              </div>
            )}

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
