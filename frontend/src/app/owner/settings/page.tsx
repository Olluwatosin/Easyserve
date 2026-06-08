"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import toast from "react-hot-toast";

interface Venue {
  id: string;
  name: string;
  slug: string;
  plan: string;
  exit_pass_minutes: number;
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["QR ordering", "Staff roles", "Basic analytics", "Exit pass", "Alerts"],
  growth: ["Everything in Starter", "Peak hours analytics", "Top items ranking", "Staff performance scores"],
  pro: ["Everything in Growth", "Priority support", "Custom branding"],
  enterprise: ["Everything in Pro", "Dedicated support", "SLA guarantee", "Multi-venue"],
};

export default function SettingsPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [exitMinutes, setExitMinutes] = useState(7);
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    api.get("/venues/me").then((r) => {
      setVenue(r.data);
      setExitMinutes(r.data.exit_pass_minutes);
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/venues/me", { exit_pass_minutes: exitMinutes });
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
