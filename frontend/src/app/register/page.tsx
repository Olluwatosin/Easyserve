"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";
import { HeroArt } from "@/components/HeroArt";

// Self-hosted gradient backdrop — no third-party image dependency at runtime.
const HERO_BG =
  "radial-gradient(ellipse at 25% 25%, rgba(255,149,0,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(0,212,180,0.14) 0%, transparent 50%), linear-gradient(160deg, #14202C 0%, #080D14 65%)";

const FIELDS = [
  { key: "venue_name", label: "Venue Name", type: "text", placeholder: "The Grand Lounge" },
  { key: "full_name", label: "Your Full Name", type: "text", placeholder: "John Doe" },
  { key: "email", label: "Email", type: "email", placeholder: "owner@venue.com" },
  { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
  { key: "confirm", label: "Confirm Password", type: "password", placeholder: "••••••••" },
] as const;

type FormKey = (typeof FIELDS)[number]["key"];

export default function RegisterPage() {
  const [form, setForm] = useState<Record<FormKey, string>>({
    venue_name: "",
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const set = (k: FormKey, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        venue_name: form.venue_name,
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      });
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      toast.success("Welcome to EasyServe!");
      router.replace("/owner");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex bg-bg overflow-hidden">
      {/* ── Left hero panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-shrink-0">
        {/* Narrower panel than login, so the crop holds further right to keep
            the glass off the edge. */}
        <HeroArt
          className="absolute inset-0"
          position="72% 55%"
          sizes="(min-width: 1024px) 45vw, 100vw"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,149,0,0.12) 0%, transparent 42%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(8,13,20,0.94) 0%, rgba(8,13,20,0.45) 26%, rgba(8,13,20,0.05) 58%, transparent 100%)",
          }}
        />

        <div className="relative flex flex-col justify-between h-full p-12 z-10">
          <div className="flex items-center gap-3">
            <EsLogo size={40} variant="glass" />
            <span className="font-display text-xl font-bold text-white">EasyServe</span>
          </div>

          <div>
            <p className="font-display text-[2.4rem] font-bold text-white leading-[1.15] mb-3">
              Launch your venue<br />in minutes.
            </p>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Join hundreds of lounges across Africa using EasyServe to run smoother, serve faster, and earn more.
            </p>

            <div className="mt-8 space-y-3">
              {[
                "QR table ordering — no app needed",
                "Live kitchen & bar display",
                "Payments, exit passes & analytics",
              ].map((point) => (
                <div key={point} className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(0,212,180,0.2)" }}
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="#00D4B4"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span className="text-white/60 text-sm">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex-1 relative flex items-center justify-center px-6 py-10 overflow-hidden">
        {/* Mobile background — heavier veil, the form sits straight on top. */}
        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <HeroArt className="absolute inset-0" position="70% 50%" sizes="100vw" />
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,13,20,0.82)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,13,20,0.55) 0%, rgba(8,13,20,0.88) 100%)",
            }}
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

        <div className="relative z-10 w-full max-w-[400px] animate-fade-in">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-6 lg:hidden">
            <EsLogo size={56} variant="glow-glass" className="mb-4" />
          </div>

          <div className="hidden lg:block mb-7">
            <h2
              className="font-display text-3xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Create your venue
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              Get started with EasyServe in minutes
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(8,13,20,0.72)",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,212,180,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            {FIELDS.map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--text-soft)" }}
                >
                  {label}
                </label>
                <input
                  className="input"
                  type={type}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  required
                />
              </div>
            ))}

            <button type="submit" disabled={loading} className="btn-teal w-full mt-2">
              {loading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full"
                    style={{ animation: "spin-custom 0.7s linear infinite" }}
                  />
                  Creating account…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "var(--muted)" }}>
            Already registered?{" "}
            <a href="/login" className="text-teal hover:underline font-medium">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
