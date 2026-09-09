"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

import { publicApi } from "@/lib/publicApi";
import { EsLogo } from "@/components/EsLogo";

const HERO_BG =
  "radial-gradient(ellipse at 25% 25%, rgba(0,212,180,0.16) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(255,149,0,0.08) 0%, transparent 50%), linear-gradient(160deg, #10202F 0%, #080D14 65%)";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  // Arriving from the email link carries ?token=… ; from the WhatsApp flow it
  // carries ?phone=… and the 6-digit code is typed in below.
  const linkToken = params.get("token") ?? "";
  const phone = params.get("phone") ?? "";
  const byCode = !linkToken && !!phone;
  const [code, setCode] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (byCode && !/^\d{6}$/.test(code.trim())) {
      toast.error("Enter the 6-digit code from WhatsApp");
      return;
    }
    setBusy(true);
    try {
      await publicApi.post("/auth/reset-password", {
        token: byCode ? code.trim() : linkToken,
        new_password: password,
        ...(byCode ? { phone } : {}),
      });
      setDone(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Could not reset your password. Request a new link.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!linkToken && !phone) {
    return (
      <div className="card p-6 space-y-3 text-sm">
        <p className="font-semibold" style={{ color: "var(--amber)" }}>
          This link is incomplete
        </p>
        <p style={{ color: "var(--text-soft)" }}>
          Open the link from your email exactly as it was sent, or request a new
          one from the sign-in page.
        </p>
        <button onClick={() => router.push("/login")} className="btn-teal w-full">
          Back to sign in
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-6 space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} style={{ color: "var(--teal)" }} />
          <p className="font-semibold" style={{ color: "var(--teal)" }}>
            Password updated
          </p>
        </div>
        <p style={{ color: "var(--text-soft)" }}>
          You have been signed out everywhere else. Sign in with your new
          password.
        </p>
        <button onClick={() => router.push("/login")} className="btn-teal w-full">
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      {byCode && (
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text-soft)" }}
          >
            Code from WhatsApp
          </label>
          <input
            className="input text-center tracking-[0.4em] text-lg"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
            autoFocus
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
            Sent to {phone}. Expires in 10 minutes.
          </p>
        </div>
      )}

      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--text-soft)" }}
        >
          New password
        </label>
        <div className="relative">
          <input
            className="input pr-11"
            type={showPw ? "text" : "password"}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
            style={{ color: "var(--muted)" }}
            tabIndex={-1}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {tooShort && (
          <p className="text-xs mt-1.5" style={{ color: "var(--amber)" }}>
            Use at least 8 characters.
          </p>
        )}
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--text-soft)" }}
        >
          Confirm new password
        </label>
        <input
          className="input"
          type={showPw ? "text" : "password"}
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
        {mismatch && (
          <p className="text-xs mt-1.5" style={{ color: "var(--amber)" }}>
            These do not match.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || tooShort || mismatch}
        className="btn-teal w-full"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>

      <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
        {byCode
          ? "Codes expire after 10 minutes and lock after 5 wrong tries."
          : "Reset links expire after 30 minutes and work only once."}
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: HERO_BG }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <EsLogo size={44} />
          <h1
            className="font-display text-xl font-bold"
            style={{ color: "var(--text)" }}
          >
            Choose a new password
          </h1>
        </div>
        <Suspense
          fallback={
            <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
              Loading…
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
