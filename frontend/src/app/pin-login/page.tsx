"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getRoleHome } from "@/components/AuthGuard";
import { Delete } from "lucide-react";
import toast from "react-hot-toast";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

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
      const { data } = await api.post("/auth/pin-login", { venue_slug: venue.trim(), pin: p });
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
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-xs animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 font-display font-bold text-xl"
            style={{
              background: "linear-gradient(135deg, #00D4B4 0%, #00906B 100%)",
              color: "#080D14",
              boxShadow: "0 0 28px rgba(0,212,180,0.3)",
            }}
          >
            ES
          </div>
          <p className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
            Staff Sign In
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Enter your 4-digit PIN
          </p>
        </div>

        {/* Venue slug (step 1) */}
        {step === "venue" ? (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "#111827",
              border: "1px solid #1E2D42",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-soft)" }}>
                Venue ID
              </label>
              <input
                className="input"
                placeholder="grand-noir"
                value={venue}
                onChange={(e) => setVenue(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                autoComplete="off"
                autoCapitalize="none"
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
              Continue
            </button>
            <a
              href="/login"
              className="block text-center text-xs"
              style={{ color: "var(--muted)" }}
            >
              Owner? <span className="text-teal hover:underline">Sign in here</span>
            </a>
          </div>
        ) : (
          /* PIN pad (step 2) */
          <div
            className="rounded-2xl p-6"
            style={{
              background: "#111827",
              border: "1px solid #1E2D42",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            }}
          >
            <p className="text-center text-sm mb-5" style={{ color: "var(--muted)" }}>
              <span
                className="font-semibold cursor-pointer hover:text-teal transition-colors"
                style={{ color: "var(--text-soft)" }}
                onClick={() => { setStep("venue"); setPin(""); }}
              >
                {venue}
              </span>{" "}
              ·{" "}
              <span
                className="cursor-pointer hover:text-teal transition-colors"
                onClick={() => { setStep("venue"); setPin(""); }}
              >
                change
              </span>
            </p>

            {/* Dots */}
            <div className="flex justify-center gap-4 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full transition-all duration-150"
                  style={{
                    background: i < pin.length ? "var(--teal)" : "#1E2D42",
                    boxShadow: i < pin.length ? "0 0 10px rgba(0,212,180,0.5)" : "none",
                    transform: i < pin.length ? "scale(1.15)" : "scale(1)",
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
                    className="h-14 rounded-2xl flex items-center justify-center font-display font-bold text-xl transition-all duration-100 active:scale-95"
                    style={{
                      background: key === "del" ? "rgba(239,68,68,0.08)" : "#1A2535",
                      border: "1px solid #1E2D42",
                      color: key === "del" ? "#f87171" : "var(--text)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        key === "del" ? "rgba(239,68,68,0.3)" : "rgba(0,212,180,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#1E2D42";
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
    </main>
  );
}
