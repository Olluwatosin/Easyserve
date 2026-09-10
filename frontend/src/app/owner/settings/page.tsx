"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Eye, EyeOff, KeyRound, MessageCircle, Wallet } from "lucide-react";
import toast from "react-hot-toast";

interface Venue {
  id: string;
  name: string;
  slug: string;
  plan: string;
  exit_pass_minutes: number;
  service_charge_pct: number;
  vat_pct: number;
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["QR ordering", "Staff roles", "Basic analytics", "Exit pass", "Alerts"],
  growth: ["Everything in Starter", "Peak hours analytics", "Top items ranking", "Staff performance scores"],
  pro: ["Everything in Growth", "Priority support", "Custom branding"],
  enterprise: ["Everything in Pro", "Dedicated support", "SLA guarantee", "Multi-venue"],
};

export default function SettingsPage() {
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [attendantsPay, setAttendantsPay] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const [venue, setVenue] = useState<Venue | null>(null);
  const [exitMinutes, setExitMinutes] = useState(7);
  const [drinkPrep, setDrinkPrep] = useState(5);
  const [foodPrep, setFoodPrep] = useState(15);
  const [serviceChargePct, setServiceChargePct] = useState(0);
  const [vatPct, setVatPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();

  // Change password state
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => {
        if (r.data?.phone) {
          setRecoveryPhone(r.data.phone);
          setPhoneSaved(true);
        }
      })
      .catch(() => {});
  }, []);

  async function toggleAttendantsPay(next: boolean) {
    setAttendantsPay(next);
    try {
      await api.patch("/venues/me", { attendants_take_payment: next });
      toast.success(
        next
          ? "Attendants can now take cash and POS at the table"
          : "Only the cashier can take payment",
      );
    } catch {
      setAttendantsPay(!next);
      toast.error("Could not change that");
    }
  }

  async function saveRecoveryPhone() {
    setSavingPhone(true);
    try {
      await api.post("/auth/recovery-phone", { phone: recoveryPhone });
      setPhoneSaved(true);
      toast.success("Recovery number saved");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Could not save that number";
      toast.error(msg);
    } finally {
      setSavingPhone(false);
    }
  }

  useEffect(() => {
    api.get("/venues/me").then((r) => {
      setAttendantsPay(Boolean(r.data?.attendants_take_payment));
      setVenue(r.data);
      setExitMinutes(r.data.exit_pass_minutes);
      setDrinkPrep(r.data.drink_prep_minutes ?? 5);
      setFoodPrep(r.data.food_prep_minutes ?? 15);
      setServiceChargePct(Number(r.data.service_charge_pct ?? 0));
      setVatPct(Number(r.data.vat_pct ?? 0));
    }).catch(() => {});
  }, []);

  async function changePassword() {
    if (pwForm.next !== pwForm.confirm) { toast.error("Passwords don't match"); return; }
    if (pwForm.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current,
        new_password: pwForm.next,
      });
      toast.success("Password updated successfully");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Update failed";
      toast.error(msg);
    } finally {
      setPwSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch("/venues/me", {
        exit_pass_minutes: exitMinutes,
        drink_prep_minutes: drinkPrep,
        food_prep_minutes: foodPrep,
        service_charge_pct: serviceChargePct,
        vat_pct: vatPct,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text">Settings</h1>
        <p className="text-muted text-sm mt-1">Venue configuration and plan details</p>
      </div>

      <div className="max-w-2xl space-y-8">
        {/* Venue info */}
        <div className="card space-y-4">
          <h2 className="font-display text-lg font-semibold text-text">Venue</h2>
          {venue ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted">Venue Name</p>
                  <p className="text-text font-medium">{venue.name}</p>
                </div>
                <div>
                  <p className="text-muted">Slug</p>
                  <p className="text-text font-medium">/{venue.slug}</p>
                </div>
                <div>
                  <p className="text-muted">Owner</p>
                  <p className="text-text font-medium">{user?.full_name}</p>
                </div>
                <div>
                  <p className="text-muted">Email</p>
                  <p className="text-text font-medium">{user?.email}</p>
                </div>
              </div>

              <div>
                <label className="block text-text-soft text-sm font-medium mb-1.5">
                  Exit Pass Validity (minutes)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    className="input w-32"
                    type="number"
                    min="1"
                    max="60"
                    value={exitMinutes}
                    onChange={(e) => setExitMinutes(parseInt(e.target.value))}
                  />
                  <p className="text-muted text-sm">Default: 7 min · Range: 1–60 min</p>
                </div>
              </div>

              <div>
                <label className="block text-text-soft text-sm font-medium mb-1.5">
                  What guests are told to expect
                </label>
                <p className="text-muted text-sm mb-2.5">
                  Once a station accepts an item the guest sees a countdown.
                  Set these to what you can hit on a busy night — a timer that
                  runs out while someone is still waiting is worse than none.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-muted text-xs mb-1.5">Drinks (minutes)</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="60"
                      value={drinkPrep}
                      onChange={(e) => setDrinkPrep(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label className="block text-muted text-xs mb-1.5">Kitchen (minutes)</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="120"
                      value={foodPrep}
                      onChange={(e) => setFoodPrep(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-text-soft text-sm font-medium mb-1.5">
                    Service Charge (%)
                  </label>
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    max="25"
                    step="0.5"
                    value={serviceChargePct}
                    onChange={(e) => setServiceChargePct(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-text-soft text-sm font-medium mb-1.5">
                    VAT (%)
                  </label>
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    max="15"
                    step="0.5"
                    value={vatPct}
                    onChange={(e) => setVatPct(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <p className="text-muted text-xs -mt-2">
                Applied to new orders only — existing bills keep their original charges. Nigerian VAT is 7.5%.
              </p>

              <button onClick={save} disabled={saving} className="btn-teal">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-bg-hover rounded w-1/2" />
              <div className="h-4 bg-bg-hover rounded w-1/3" />
            </div>
          )}
        </div>

        {/* Who handles money. A venue with a cashier has centralised this
            deliberately, so it stays off until the owner says otherwise. */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Wallet size={18} style={{ color: "var(--teal)" }} />
            <h2 className="font-display text-lg font-semibold text-text">
              Who takes payment
            </h2>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={attendantsPay}
              onChange={(e) => toggleAttendantsPay(e.target.checked)}
              className="w-4 h-4 rounded accent-teal mt-0.5"
            />
            <span>
              <span className="block text-sm" style={{ color: "var(--text)" }}>
                Let attendants take cash and POS at the table
              </span>
              <span className="block text-xs mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                Suits venues without a cashier on duty. Every payment is still
                recorded against the person who took it and appears in the shift
                report. Bank transfers always stay with the cashier, or the guest
                pays from their own phone — nothing else confirms a transfer
                arrived.
              </span>
            </span>
          </label>
        </div>

        {/* Password recovery — without a number saved here the WhatsApp reset
            path has nothing to match on and cannot be used at all. */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} style={{ color: "var(--teal)" }} />
            <h2 className="font-display text-lg font-semibold text-text">
              Password Recovery
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-soft)" }}>
            Save a WhatsApp number and you can reset your password with a
            6-digit code if you ever forget it. Without one, email is the only
            way back into this account.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-text-soft text-sm mb-1.5">
                WhatsApp number
              </label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="08012345678"
                value={recoveryPhone}
                onChange={(e) => {
                  setRecoveryPhone(e.target.value);
                  setPhoneSaved(false);
                }}
                autoComplete="tel"
              />
            </div>
            <button
              onClick={saveRecoveryPhone}
              disabled={savingPhone || !recoveryPhone.trim()}
              className="btn-teal px-5"
            >
              {savingPhone ? "Saving…" : phoneSaved ? "Saved" : "Save number"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            08012345678, 0801 234 5678 and +234 801 234 5678 all work.
          </p>
        </div>

        {/* Change Password */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} style={{ color: "var(--teal)" }} />
            <h2 className="font-display text-lg font-semibold text-text">Change Password</h2>
          </div>
          <div className="space-y-3">
            {(["current", "next", "confirm"] as const).map((field) => {
              const labels = { current: "Current password", next: "New password", confirm: "Confirm new password" };
              return (
                <div key={field}>
                  <label className="block text-text-soft text-sm mb-1.5">{labels[field]}</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showPw[field] ? "text" : "password"}
                      value={pwForm[field]}
                      onChange={(e) => setPwForm((f) => ({ ...f, [field]: e.target.value }))}
                      placeholder="••••••••"
                      autoComplete={field === "current" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => ({ ...s, [field]: !s[field] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--muted)" }}
                    >
                      {showPw[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={changePassword}
            disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
            className="btn-teal"
          >
            {pwSaving ? "Updating…" : "Update Password"}
          </button>
        </div>

        {/* Plan info */}
        {venue && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-text">Current Plan</h2>
              <span className="badge-teal text-base px-4 py-1.5 capitalize">{venue.plan}</span>
            </div>
            <ul className="space-y-2">
              {PLAN_FEATURES[venue.plan]?.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-text-soft">
                  <span className="text-teal">✓</span> {f}
                </li>
              ))}
            </ul>
            {venue.plan !== "enterprise" && (
              <div className="border-t border-border pt-4">
                <p className="text-muted text-sm mb-3">
                  Upgrade to unlock advanced analytics, staff performance scores, and more.
                </p>
                <a
                  href="mailto:sales@easyserve.ng"
                  className="btn-outline inline-flex items-center gap-2 text-sm"
                >
                  Contact Sales to Upgrade
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
