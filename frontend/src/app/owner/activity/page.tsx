"use client";

/**
 * Who has used this, and what they did.
 *
 * Written for the evening you hand out logins and want to know whether anybody
 * opened them. So the list leads with the people who have *not* arrived — that
 * absence is the answer being looked for, and burying it under a list of people
 * who did sign in makes it something you have to go hunting for.
 *
 * Two numbers per person rather than one total, because "signed in and did
 * nothing" and "signed in and worked a shift" are different situations and a
 * single count hides which you are looking at.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, RefreshCw, ScrollText } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

interface Person {
  user_id: string;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
  sign_ins: number;
  actions: number;
  first_seen: string | null;
  last_seen: string | null;
  has_signed_in: boolean;
}

interface PeopleResponse {
  days: number;
  people: Person[];
  signed_in_count: number;
  total_accounts: number;
}

interface Entry {
  id: string;
  at: string | null;
  who: string;
  role: string | null;
  action: string;
  what: string;
  details: Record<string, unknown> | null;
}

const RANGES = [
  { key: 1, label: "Today" },
  { key: 7, label: "7 days" },
  { key: 14, label: "14 days" },
  { key: 30, label: "30 days" },
] as const;

function when(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} hr ago`;
  return then.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const [days, setDays] = useState<number>(14);
  const [people, setPeople] = useState<PeopleResponse | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    Promise.all([
      api.get<PeopleResponse>("/activity/people", { params: { days } }),
      api.get<{ entries: Entry[] }>("/activity", { params: { days, limit: 100 } }),
    ])
      .then(([p, a]) => {
        setPeople(p.data);
        setEntries(a.data.entries);
      })
      .catch(() => toast.error("Could not load activity"))
      .finally(() => setBusy(false));
  }, [days]);

  useEffect(load, [load]);

  const waiting = people?.people.filter((p) => !p.has_signed_in) ?? [];
  const arrived = people?.people.filter((p) => p.has_signed_in) ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text)" }}>
            Activity
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Who has signed in, and what has been done.
          </p>
        </div>
        <button
          onClick={load}
          disabled={busy}
          className="btn-ghost"
          style={{ color: "var(--muted)" }}
          title="Refresh"
        >
          <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {RANGES.map((r) => {
          const on = days === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setDays(r.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                color: on ? "var(--teal)" : "var(--muted)",
                background: on ? "rgba(0,212,180,0.08)" : "transparent",
                border: `1px solid ${on ? "rgba(0,212,180,0.25)" : "var(--border)"}`,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {people && (
        <div className="card mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <p className="font-display text-3xl font-bold tabular-nums" style={{ color: "var(--teal)" }}>
              {people.signed_in_count}
              <span className="text-lg" style={{ color: "var(--muted)" }}>
                {" "}/ {people.total_accounts}
              </span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              accounts have signed in
            </p>
          </div>
          {waiting.length > 0 && (
            <p className="text-sm" style={{ color: "var(--amber)" }}>
              {waiting.length} {waiting.length === 1 ? "person has" : "people have"} not
              opened it yet
            </p>
          )}
        </div>
      )}

      {/* ── Not yet arrived: the row you came here to find ── */}
      {waiting.length > 0 && (
        <section className="mb-7">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--muted)" }}
          >
            Not signed in yet
          </h2>
          <div className="space-y-2">
            {waiting.map((p) => (
              <div
                key={p.user_id}
                className="card-sm flex items-center gap-3"
                style={{ borderColor: "rgba(255,149,0,0.25)" }}
              >
                <CircleDashed size={15} style={{ color: "var(--amber)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {p.name}
                    {!p.is_active && (
                      <span className="badge-muted ml-2">switched off</span>
                    )}
                  </p>
                  <p className="text-xs capitalize" style={{ color: "var(--muted)" }}>
                    {p.role} · {p.email}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Arrived ── */}
      {arrived.length > 0 && (
        <section className="mb-7">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--muted)" }}
          >
            Has signed in
          </h2>
          <div className="space-y-2">
            {arrived.map((p) => (
              <div key={p.user_id} className="card-sm flex items-center gap-3">
                <CheckCircle2 size={15} style={{ color: "var(--teal)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {p.name}
                  </p>
                  <p className="text-xs capitalize" style={{ color: "var(--muted)" }}>
                    {p.role} · last seen {when(p.last_seen)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                    {p.sign_ins}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {p.sign_ins === 1 ? "sign-in" : "sign-ins"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 w-16">
                  <p
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: p.actions > 0 ? "var(--text)" : "var(--muted)" }}
                  >
                    {p.actions}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    actions
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── The trail ── */}
      <section>
        <h2
          className="text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2"
          style={{ color: "var(--muted)" }}
        >
          <ScrollText size={13} />
          What has been done
        </h2>
        {entries && entries.length === 0 ? (
          <div className="card text-center">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing recorded in this period.
            </p>
          </div>
        ) : (
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {(entries ?? []).map((e) => (
              <div
                key={e.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-baseline gap-3"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="text-xs tabular-nums flex-shrink-0 w-20"
                  style={{ color: "var(--muted)" }}
                >
                  {when(e.at)}
                </span>
                <span className="text-sm flex-1" style={{ color: "var(--text-soft)" }}>
                  <strong style={{ color: "var(--text)" }}>{e.who}</strong> — {e.what}
                  {e.details?.method ? (
                    <span style={{ color: "var(--muted)" }}>
                      {" "}
                      ({String(e.details.method) === "pin" ? "PIN" : "password"})
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
