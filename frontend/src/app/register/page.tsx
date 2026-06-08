"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [form, setForm] = useState({
    venue_name: "",
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg bg-teal-glow px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold text-teal tracking-tight">EasyServe</h1>
          <p className="text-muted text-sm mt-2">Create your venue account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {[
            { key: "venue_name", label: "Venue Name", type: "text", placeholder: "The Grand Lounge" },
            { key: "full_name", label: "Your Full Name", type: "text", placeholder: "John Doe" },
            { key: "email", label: "Email", type: "email", placeholder: "owner@venue.com" },
            { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
            { key: "confirm", label: "Confirm Password", type: "password", placeholder: "••••••••" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-text-soft text-sm font-medium mb-1.5">{label}</label>
              <input
                className="input"
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => set(key, e.target.value)}
                required
              />
            </div>
          ))}

          <button type="submit" disabled={loading} className="btn-teal w-full mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                Creating account…
              </span>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <p className="text-center text-muted text-xs mt-6">
          Already registered?{" "}
          <a href="/login" className="text-teal hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
