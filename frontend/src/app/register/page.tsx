"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { EsLogo } from "@/components/EsLogo";
import { HeroArt } from "@/components/HeroArt";

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
    <main className="relative min-h-screen bg-bg overflow-hidden">
      {/* Same full-bleed treatment as sign-in — the two entry screens should
          feel like one room, not two. */}
      <HeroArt className="fixed inset-0" position="62% 50%" sizes="100vw" priority />

      <div
        className="fixed inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(8,13,20,0.95) 0%, rgba(8,13,20,0.86) 24%, rgba(8,13,20,0.5) 46%, rgba(8,13,20,0.14) 68%, rgba(8,13,20,0) 100%)",
        }}
      />
      <div
        className="fixed inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,13,20,0.72) 0%, rgba(8,13,20,0.86) 100%)",
        }}
      />
      <div
        className="fixed inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(8,13,20,0.8) 0%, rgba(8,13,20,0.12) 28%, transparent 55%)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col px-6 py-10 lg:px-16 lg:py-12">
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <EsLogo size={40} variant="glass" />
          <span className="font-display text-xl font-bold text-white">EasyServe</span>
        </div>

        <div className="flex-1 flex items-center justify-center lg:justify-start py-8">
          <div className="w-full max-w-[400px] animate-fade-in">

            <div className="mb-7 text-center lg:text-left">
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

        {/* Foot: what they get. Desktop only — the form is long enough on a
            phone without it. */}
        <div className="hidden lg:block">
          <p className="font-display text-2xl font-bold text-white leading-tight mb-3">
            Launch your venue in minutes.
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {[
              "QR table ordering — no app needed",
              "Live kitchen & bar display",
              "Payments, exit passes & analytics",
            ].map((point) => (
              <div key={point} className="flex items-center gap-2.5">
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
    </main>
  );
}
