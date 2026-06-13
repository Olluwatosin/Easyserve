"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const HERO =
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=1400&q=85";

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
        <Image
          src={HERO}
          alt="Luxury dining and drinks"
          fill
          className="object-cover"
          priority
          sizes="45vw"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,149,0,0.1) 0%, rgba(8,13,20,0.55) 55%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(8,13,20,0.93) 0%, rgba(8,13,20,0.1) 45%, transparent 100%)",
          }}
        />

        <div className="relative flex flex-col justify-between h-full p-12 z-10">
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
      <div className="flex-1 relative flex items-center justify-center px-6 py-10">
        {/* Mobile background */}
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

        <div className="relative w-full max-w-[400px] animate-fade-in">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-6 lg:hidden">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,212,180,0.14) 0%, rgba(0,168,143,0.06) 100%)",
                border: "1px solid rgba(0,212,180,0.22)",
              }}
            >
              <span className="font-display text-xl font-bold text-teal">ES</span>
            </div>
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
              background: "#111827",
              border: "1px solid #1E2D42",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.025), inset 0 1px 0 rgba(255,255,255,0.04)",
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
