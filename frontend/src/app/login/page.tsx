"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getRoleHome } from "@/components/AuthGuard";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";
import { publicApi } from "@/lib/publicApi";

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
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotVia, setForgotVia] = useState<"email" | "whatsapp">("email");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { login, loading } = useAuthStore();
  const router = useRouter();

  async function handleForgot() {
    const viaWhatsApp = forgotVia === "whatsapp";
    const target = viaWhatsApp ? forgotPhone.trim() : (forgotEmail || email).trim();
    if (!target) {
      toast.error(
        viaWhatsApp ? "Enter your phone number first" : "Enter your email address first",
      );
      return;
    }
    setForgotBusy(true);
    try {
      await publicApi.post(
        "/auth/forgot-password",
        viaWhatsApp ? { phone: target } : { email: target },
      );
    } catch {
      // Deliberately ignored. The endpoint answers identically for registered
      // and unregistered addresses so it cannot be used to discover who has an
      // account; surfacing an error here would leak exactly that.
    } finally {
      setForgotBusy(false);
      setForgotSent(true);
      if (viaWhatsApp) router.push(`/reset-password?phone=${encodeURIComponent(target)}`);
    }
  }

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
                className="rounded-xl p-4 text-xs space-y-3 animate-fade-in"
                style={{
                  background: "rgba(0,212,180,0.06)",
                  border: "1px solid rgba(0,212,180,0.2)",
                }}
              >
                {forgotSent ? (
                  <p style={{ color: "var(--text-soft)" }}>
                    If <strong>{forgotVia === "whatsapp" ? forgotPhone : forgotEmail || email}</strong>{" "}
                    has an account, a reset {forgotVia === "whatsapp" ? "code" : "link"} is on its
                    way. Check your spam folder if it doesn&apos;t arrive.
                  </p>
                ) : (
                  <>
                    <p className="font-semibold" style={{ color: "var(--teal)" }}>
                      Reset your password
                    </p>

                    <div className="flex gap-2">
                      {(["whatsapp", "email"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setForgotVia(mode)}
                          className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                          style={{
                            background:
                              forgotVia === mode ? "rgba(0,212,180,0.16)" : "transparent",
                            border: `1px solid ${
                              forgotVia === mode
                                ? "rgba(0,212,180,0.45)"
                                : "rgba(255,255,255,0.10)"
                            }`,
                            color: forgotVia === mode ? "var(--teal)" : "var(--muted)",
                          }}
                        >
                          {mode === "whatsapp" ? "WhatsApp" : "Email"}
                        </button>
                      ))}
                    </div>

                    {forgotVia === "whatsapp" ? (
                      <>
                        <p style={{ color: "var(--text-soft)" }}>
                          We&apos;ll send a 6-digit code to your WhatsApp.
                        </p>
                        <input
                          className="input"
                          type="tel"
                          inputMode="tel"
                          placeholder="08012345678"
                          value={forgotPhone}
                          onChange={(e) => setForgotPhone(e.target.value)}
                          autoComplete="tel"
                        />
                      </>
                    ) : (
                      <>
                        <p style={{ color: "var(--text-soft)" }}>
                          We&apos;ll email you a link to set a new one.
                        </p>
                        <input
                          className="input"
                          type="email"
                          placeholder="you@venue.com"
                          value={forgotEmail || email}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          autoComplete="email"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleForgot}
                      disabled={forgotBusy}
                      className="btn-teal w-full"
                    >
                      {forgotBusy
                        ? "Sending…"
                        : forgotVia === "whatsapp"
                          ? "Send code on WhatsApp"
                          : "Send reset link"}
                    </button>
                    <p style={{ color: "var(--muted)" }}>
                      <strong>Staff member?</strong> Ask your venue manager to
                      reset your PIN from the Staff page.
                    </p>
                  </>
                )}
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
