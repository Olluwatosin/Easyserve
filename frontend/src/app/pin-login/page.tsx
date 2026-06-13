"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getRoleHome } from "@/components/AuthGuard";
import { Delete } from "lucide-react";
import toast from "react-hot-toast";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

const FEATURES = [
  { icon: "🎯", label: "PIN-based access" },
  { icon: "⚡", label: "Instant role login" },
  { icon: "🔐", label: "Station-scoped portal" },
];

export default function PinLoginPage() {
  const [venue, setVenue] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"venue" | "pin">("venue");
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
        {/* Background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=1400&q=85')",
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

        {/* Top: ES badge */}
        <div className="relative z-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm"
            style={{
              background: "linear-gradient(135deg, #00D4B4 0%, #00906B 100%)",
              color: "#080D14",
              boxShadow: "0 0 24px rgba(0,212,180,0.35)",
            }}
          >
            ES
          </div>
        </div>

        {/* Middle: Heading + features */}
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
              Where the crew keeps the night alive.
            </p>
          </div>
          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-xl">{f.icon}</span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgba(176,188,204,0.85)" }}
                >
                  {f.label}
                </span>
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
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-screen">
        {/* Mobile: blurred background */}
        <div
          className="lg:hidden absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=800&q=60')",
            filter: "blur(14px) brightness(0.18)",
          }}
        />

        <div className="relative z-10 w-full max-w-sm px-6 py-10 animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-sm"
              style={{
                background: "linear-gradient(135deg, #00D4B4 0%, #00906B 100%)",
                color: "#080D14",
                boxShadow: "0 0 20px rgba(0,212,180,0.3)",
              }}
            >
              ES
            </div>
            <span
              className="font-display font-bold text-sm"
              style={{ color: "var(--text)" }}
            >
              EasyServe
            </span>
          </div>

          {/* Page heading */}
          <div className="mb-7">
            <h1
              className="font-display text-2xl font-bold"
              style={{ color: "var(--text)" }}
            >
              {step === "venue" ? "Find your venue" : "Enter your PIN"}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
              {step === "venue"
                ? "Staff sign-in — different from owner login"
                : `Venue: ${venue}`}
            </p>
          </div>

          {/* Form card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "#111827",
              border: "1px solid #1E2D42",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
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
                    placeholder="the-grand-noir"
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
                    Ask your manager for your venue ID
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
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
