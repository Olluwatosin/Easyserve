"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getRoleHome } from "@/components/AuthGuard";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";
import { HeroArt } from "@/components/HeroArt";
import { publicApi } from "@/lib/publicApi";

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
    <main className="relative min-h-screen bg-bg overflow-hidden">
      {/* One photograph behind the whole page — the card floats on it rather
          than sitting in a panel beside it. */}
      <HeroArt className="fixed inset-0" position="62% 50%" sizes="100vw" priority />

      {/* The drink sits right of centre and the room falls away to the left, so
          the page darkens leftward where the type and the card live and stays
          clear on the right where the glass is. The form's contrast comes from
          the card itself, not from dimming the photograph — dimming it is what
          made this page look flat to begin with. */}
      <div
        className="fixed inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(8,13,20,0.95) 0%, rgba(8,13,20,0.86) 24%, rgba(8,13,20,0.5) 46%, rgba(8,13,20,0.14) 68%, rgba(8,13,20,0) 100%)",
        }}
      />
      {/* A phone has no width for the room to fall away across, so it veils
          evenly instead and leans darker — the card sits over the glass there
          whatever we do. */}
      <div
        className="fixed inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,13,20,0.72) 0%, rgba(8,13,20,0.86) 100%)",
        }}
      />
      {/* A foot on every size, so the bottom row never floats on a bright bar. */}
      <div
        className="fixed inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(8,13,20,0.8) 0%, rgba(8,13,20,0.12) 28%, transparent 55%)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col px-6 py-10 lg:px-16 lg:py-12">
        {/* Wordmark, now on every size — the split layout used to carry two. */}
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <EsLogo size={40} variant="glass" />
          <span className="font-display text-xl font-bold text-white">
            EasyServe
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center lg:justify-start">
          <div className="w-full max-w-[390px] animate-fade-in">
            <div className="mb-7 text-center lg:text-left">
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

        {/* Foot: tagline and proof points. Desktop only — on a phone the card
            already fills the screen and the photograph carries the mood alone. */}
        <div className="hidden lg:block">
          <p className="font-display text-2xl font-bold text-white leading-tight mb-1.5">
            Where luxury meets service.
          </p>
          <p className="text-white/45 text-sm max-w-sm">
            The all-in-one hospitality OS for Africa&apos;s finest nightlife venues.
          </p>
          <div className="flex gap-8 mt-5">
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
    </main>
  );
}
