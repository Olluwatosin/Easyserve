"use client";

/**
 * What the guest sees while they wait.
 *
 * The floor has always had this — an attendant can see every item move from
 * accepted to ready. The guest had nothing between "Sent to kitchen!" and food
 * arriving, which is the stretch where people start looking around for someone
 * to ask.
 *
 * Two rules shape it:
 *
 * The countdown runs from when a station *accepted* the item, not from when it
 * was ordered. A ticket sitting in a queue for ten minutes must not show as
 * nearly ready.
 *
 * When the estimate runs out and the item is still coming, the timer stops
 * counting and says so rather than going negative or silently vanishing. A
 * kitchen running late is a fact the guest can live with; a timer that lies is
 * what makes someone stop trusting the screen.
 */

import { useEffect, useState } from "react";
import { Check, ChefHat, Clock, Send } from "lucide-react";

export interface TrackedItem {
  id: string;
  name: string;
  quantity: number;
  item_type: string;
  status: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  prep_minutes?: number | null;
}

const STEPS = ["pending", "preparing", "ready", "delivered"] as const;

const COPY: Record<string, { label: string; hint: string }> = {
  pending: { label: "Sent", hint: "The bar has your order" },
  preparing: { label: "Being made", hint: "" },
  ready: { label: "Ready", hint: "Coming to your table" },
  delivered: { label: "Served", hint: "" },
  cancelled: { label: "Cancelled", hint: "Speak to your attendant" },
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Countdown({ item, now }: { item: TrackedItem; now: number }) {
  if (item.status !== "preparing" || !item.accepted_at || !item.prep_minutes) {
    return null;
  }
  const doneAt = new Date(item.accepted_at).getTime() + item.prep_minutes * 60_000;
  const left = Math.round((doneAt - now) / 1000);

  if (left <= 0) {
    // Past the estimate. Say so plainly rather than showing a negative number
    // or quietly hiding — the guest can see their drink has not arrived.
    return (
      <span className="text-xs" style={{ color: "var(--amber)" }}>
        Taking a little longer
      </span>
    );
  }

  const mins = Math.floor(left / 60);
  const secs = left % 60;
  return (
    <span
      className="text-xs tabular-nums font-semibold"
      style={{ color: "var(--teal)" }}
    >
      ~{mins}:{String(secs).padStart(2, "0")} left
    </span>
  );
}

export function OrderTracker({ items }: { items: TrackedItem[] }) {
  const live = items.some((i) => i.status === "preparing");
  const now = useNow(live);

  const active = items.filter((i) => i.status !== "cancelled");
  if (active.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {active.map((item) => {
        const idx = STEPS.indexOf(item.status as (typeof STEPS)[number]);
        const copy = COPY[item.status] ?? COPY.pending;
        const done = item.status === "delivered";
        const ready = item.status === "ready";

        const Icon = done ? Check : ready ? Check : item.status === "preparing" ? ChefHat : Send;
        const accent = done
          ? "var(--muted)"
          : ready
            ? "var(--teal)"
            : item.status === "preparing"
              ? "var(--amber)"
              : "var(--text-soft)";

        return (
          <div
            key={item.id}
            className="rounded-xl px-4 py-3"
            style={{
              background: ready ? "rgba(0,212,180,0.07)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${ready ? "rgba(0,212,180,0.3)" : "rgba(255,255,255,0.08)"}`,
              opacity: done ? 0.6 : 1,
            }}
          >
            <div className="flex items-center gap-2.5">
              <Icon size={15} style={{ color: accent, flexShrink: 0 }} />
              <span
                className="flex-1 text-sm truncate"
                style={{ color: "var(--text)" }}
              >
                {item.quantity}× {item.name}
              </span>
              <Countdown item={item} now={now} />
            </div>

            {/* Four beads: sent, being made, ready, served. Position is the
                status; no legend needed because the label sits right beside it. */}
            <div className="flex items-center gap-1.5 mt-2.5">
              {STEPS.map((step, i) => (
                <span
                  key={step}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{
                    background:
                      i <= idx ? accent : "rgba(255,255,255,0.09)",
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-xs font-medium" style={{ color: accent }}>
                {copy.label}
              </span>
              {copy.hint && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  · {copy.hint}
                </span>
              )}
              {item.status === "pending" && (
                <Clock size={11} style={{ color: "var(--muted)" }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
