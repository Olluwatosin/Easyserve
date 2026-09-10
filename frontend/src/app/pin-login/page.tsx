"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getRoleHome } from "@/components/AuthGuard";
import { Delete } from "lucide-react";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

const ROLES = [
  { icon: "🍸", role: "Bartender", desc: "Bar display & drink orders" },
  { icon: "🍽️", role: "Kitchen", desc: "Food tickets & prep queue" },
  { icon: "💳", role: "Cashier", desc: "Payments & exit passes" },
  { icon: "🛎️", role: "Attendant", desc: "Table service & alerts" },
  { icon: "🔒", role: "Security", desc: "Exit QR scanner" },
];

function PinLoginContent() {
  const [venue, setVenue] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"venue" | "pin">("venue");
  const params = useSearchParams();

  // The venue comes from the link the manager shared, or from the last
  // successful sign-in on this device. Staff should not be typing a slug
  // correctly at 8pm on a busy floor.
  useEffect(() => {
    const fromLink = params.get("venue")?.trim();
    const remembered = localStorage.getItem("venue_slug");
    const slug = fromLink || remembered;
    if (slug) {
      setVenue(slug);
      setStep("pin");
    }
  }, [params]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function pressKey(key: string) {
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      if (next.length === 4) submit(next);
    }
  }

  async function submit(p = pin) {
    if (p.length !== 4) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/pin-login", {
        venue_slug: venue.trim(),
        pin: p,
      });
      // Remember the venue so the next shift starts straight at the keypad.
      localStorage.setItem("venue_slug", venue.trim());
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      router.replace(getRoleHome(payload.role));
    } catch {
      toast.error("Invalid PIN — try again");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex" style={{ background: "var(--bg)" }}>

      {/* ── Left hero panel (desktop only) ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden flex-shrink-0"
        style={{ width: "56%" }}
      >
        {/* Gradient backdrop — no third-party image dependency at runtime */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(0,212,180,0.14) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(255,149,0,0.08) 0%, transparent 50%), linear-gradient(160deg, #10202F 0%, #080D14 65%)",
          }}
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(8,13,20,0.88) 0%, rgba(8,13,20,0.50) 55%, rgba(8,13,20,0.82) 100%)",
          }}
        />
        {/* Teal ambient glow at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-56"
          style={{
            background:
              "linear-gradient(0deg, rgba(0,212,180,0.07) 0%, transparent 100%)",
          }}
        />

        {/* Top: logo */}
        <div className="relative z-10">
          <EsLogo size={40} />
        </div>

        {/* Middle: Heading + roles */}
        <div className="relative z-10 space-y-6">
          <div>
            <p
              className="font-display text-5xl font-bold leading-tight"
              style={{ color: "var(--text)" }}
            >
              Staff
              <br />
              Portal
            </p>
            <p className="mt-3 text-base" style={{ color: "rgba(176,188,204,0.8)" }}>
              Each role has its own station and PIN.
            </p>
          </div>

          {/* How it works */}
          <div
            className="rounded-2xl p-5 space-y-2"
            style={{ background: "rgba(8,13,20,0.45)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--teal)" }}>
              Staff roles
            </p>
            {ROLES.map((r) => (
              <div key={r.role} className="flex items-center gap-3 py-1">
                <span className="text-lg w-6 text-center flex-shrink-0">{r.icon}</span>
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{r.role}</span>
                  <span className="text-xs ml-2" style={{ color: "rgba(176,188,204,0.6)" }}>{r.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,188,204,0.5)" }}>
              How to sign in
            </p>
            {[
              { n: "1", t: "Enter your venue ID", s: "Provided by your manager" },
              { n: "2", t: "Type your 4-digit PIN", s: "Unique to your station role" },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(0,212,180,0.15)", color: "var(--teal)" }}
                >
                  {step.n}
                </span>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{step.t}</p>
                  <p className="text-xs" style={{ color: "rgba(176,188,204,0.55)" }}>{step.s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: copyright */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: "rgba(107,122,153,0.65)" }}>
            © 2024 EasyServe · Hospitality OS
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-screen overflow-hidden">
        {/* Mobile: dark gradient background */}
        <div
          className="lg:hidden absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(0,212,180,0.08) 0%, transparent 55%), linear-gradient(180deg, #0C1826 0%, #080D14 70%)",
          }}
        />
        {/* Desktop: same backdrop continues from left panel */}
        <div
          className="hidden lg:block absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(0,212,180,0.14) 0%, transparent 55%), linear-gradient(160deg, #10202F 0%, #080D14 65%)",
          }}
        />
        {/* Dark overlay */}
        <div
          className="hidden lg:block absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(8,13,20,0.80) 0%, rgba(8,13,20,0.65) 55%, rgba(8,13,20,0.78) 100%)",
          }}
        />

        <div className="relative z-10 w-full max-w-sm px-6 py-10 animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <EsLogo size={36} />
            <span
              className="font-display font-bold text-sm"
              style={{ color: "var(--text)" }}
            >
              EasyServe
            </span>
          </div>

          {/* Step indicator + heading */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              {[1, 2].map((n) => {
                const active = (step === "venue" && n === 1) || (step === "pin" && n === 2);
                const done = step === "pin" && n === 1;
                return (
                  <div key={n} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        background: active ? "var(--teal)" : done ? "rgba(0,212,180,0.2)" : "rgba(255,255,255,0.06)",
                        color: active ? "#080D14" : done ? "var(--teal)" : "var(--muted)",
                      }}
                    >
                      {done ? "✓" : n}
                    </div>
                    {n < 2 && (
                      <div className="w-8 h-px" style={{ background: done ? "rgba(0,212,180,0.4)" : "rgba(255,255,255,0.1)" }} />
                    )}
                  </div>
                );
              })}
              <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                Step {step === "venue" ? "1" : "2"} of 2
              </span>
            </div>
            <h1
              className="font-display text-2xl font-bold"
              style={{ color: "var(--text)" }}
            >
              {step === "venue" ? "Enter your venue ID" : "Enter your PIN"}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
              {step === "venue"
                ? "Your manager provided this when setting up EasyServe"
                : `Signing in to ${venue} — use your assigned station PIN`}
            </p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(8,13,20,0.72)",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,212,180,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            {step === "venue" ? (

              /* ── Step 1: Venue slug ── */
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--text-soft)" }}
                  >
                    Venue ID
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. the-grand-noir"
                    value={venue}
                    onChange={(e) =>
                      setVenue(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                    }
                    autoComplete="off"
                    autoCapitalize="none"
                    onKeyDown={(e) =>
                      e.key === "Enter" && venue.trim() && setStep("pin")
                    }
                  />
                  <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                    Lowercase, hyphens instead of spaces — your manager has this
                  </p>
                </div>
                <button
                  onClick={() => venue.trim() && setStep("pin")}
                  disabled={!venue.trim()}
                  className="btn-teal w-full"
                >
                  Continue →
                </button>
                <div className="pt-3 border-t" style={{ borderColor: "#1E2D42" }}>
                  <a
                    href="/login"
                    className="block text-center text-xs transition-colors"
                    style={{ color: "var(--muted)" }}
                  >
                    Owner?{" "}
                    <span style={{ color: "var(--teal)" }} className="font-medium hover:underline">
                      Sign in here
                    </span>
                  </a>
                </div>
              </div>

            ) : (

              /* ── Step 2: PIN pad ── */
              <div>
                {/* Venue chip + back */}
                <button
                  onClick={() => { setStep("venue"); setPin(""); }}
                  className="flex items-center gap-2 mb-6 text-xs transition-colors"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--teal)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--muted)")
                  }
                >
                  ← &nbsp;
                  <span
                    className="font-medium px-2.5 py-0.5 rounded-lg"
                    style={{
                      background: "rgba(0,212,180,0.08)",
                      border: "1px solid rgba(0,212,180,0.18)",
                      color: "var(--teal)",
                    }}
                  >
                    {venue}
                  </span>
                  &nbsp; · change
                </button>

                {/* PIN indicator dots */}
                <div className="flex justify-center gap-5 mb-8">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full transition-all duration-200"
                      style={{
                        background: i < pin.length ? "var(--teal)" : "#1E2D42",
                        boxShadow:
                          i < pin.length
                            ? "0 0 14px rgba(0,212,180,0.7)"
                            : "none",
                        transform: i < pin.length ? "scale(1.2)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>

                {/* Number pad */}
                <div className="grid grid-cols-3 gap-3">
                  {PAD.map((key, idx) => {
                    if (key === "") return <div key={idx} />;
                    return (
                      <button
                        key={idx}
                        onClick={() => pressKey(key)}
                        disabled={loading}
                        className="h-14 rounded-2xl flex items-center justify-center font-display font-bold text-xl transition-all duration-100 active:scale-95 disabled:opacity-50"
                        style={{
                          background:
                            key === "del"
                              ? "rgba(239,68,68,0.07)"
                              : "rgba(26,37,53,0.95)",
                          border:
                            key === "del"
                              ? "1px solid rgba(239,68,68,0.15)"
                              : "1px solid #1E2D42",
                          color:
                            key === "del" ? "#f87171" : "var(--text)",
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.borderColor =
                            key === "del"
                              ? "rgba(239,68,68,0.35)"
                              : "rgba(0,212,180,0.4)";
                          el.style.boxShadow =
                            key === "del"
                              ? "0 0 14px rgba(239,68,68,0.12)"
                              : "0 0 14px rgba(0,212,180,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.borderColor =
                            key === "del"
                              ? "rgba(239,68,68,0.15)"
                              : "#1E2D42";
                          el.style.boxShadow = "none";
                        }}
                      >
                        {key === "del" ? <Delete size={18} /> : key}
                      </button>
                    );
                  })}
                </div>

                {loading && (
                  <div className="flex justify-center mt-5">
                    <div
                      className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full"
                      style={{ animation: "spin-custom 0.7s linear infinite" }}
                    />
                  </div>
                )}

                <p className="text-xs text-center mt-5" style={{ color: "var(--muted)" }}>
                  Each role has a unique PIN · Contact your manager if you&apos;ve forgotten yours
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PinLoginPage() {
  return (
    <Suspense fallback={null}>
      <PinLoginContent />
    </Suspense>
  );
}
