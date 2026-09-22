"use client";

/**
 * Taking an order for a guest who is not going to scan.
 *
 * Raised by an operator and obvious once said: plenty of guests will not scan a
 * sticker — an older regular, a phone on 3%, a bottle table who expect to be
 * waited on, someone who simply does not want to. Until now that round went on
 * paper, which puts it outside the bar screen, the running total, the stock
 * count and the exit pass. One table on paper undoes all of it.
 *
 * Built for a thumb on a dark floor: big targets, a running total that never
 * leaves the screen, and one Send.
 *
 * It goes through the same offline outbox the guest app uses, so an attendant
 * standing in the one corner without signal still takes the order — it queues
 * on her phone and sends itself. The idempotency key is generated once per
 * basket rather than per attempt, which is what stops a double-tap, a retry and
 * a replayed queue from all becoming separate rounds on the same bill.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Search, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { newRequestId } from "@/lib/offline";
import { useOffline } from "@/lib/useOffline";
import { formatNGN } from "@/lib/utils";

interface Table {
  id: string;
  label: string;
  zone: string | null;
  is_active: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  effective_price?: number | null;
  item_type: string;
  category_id: string | null;
  is_available: boolean;
}

interface Category {
  id: string;
  name: string;
}

function priceOf(item: MenuItem): number {
  return Number(item.effective_price ?? item.price) || 0;
}

export function TakeOrderSheet({
  onClose,
  onPlaced,
}: {
  onClose: () => void;
  onPlaced: () => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [table, setTable] = useState<Table | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const { submit } = useOffline();

  // One key per basket, not per attempt: a double-tap, a retry and a queue
  // replayed tomorrow morning must all be the same round.
  const [requestId, setRequestId] = useState(() => newRequestId());

  useEffect(() => {
    api.get("/tables").then((r) => setTables(r.data)).catch(() => {});
    api.get("/menu/items").then((r) => setItems(r.data)).catch(() => {});
    api.get("/menu/categories").then((r) => setCats(r.data)).catch(() => {});
  }, []);

  const byZone = useMemo(() => {
    const groups: Record<string, Table[]> = {};
    for (const t of tables) {
      if (!t.is_active) continue;
      (groups[t.zone || "Tables"] ??= []).push(t);
    }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => i.is_available)
      .filter((i) => cat === "all" || i.category_id === cat)
      .filter((i) => !term || i.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, cat, q]);

  const lines = useMemo(
    () =>
      Object.entries(basket)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ item: items.find((i) => i.id === id)!, n }))
        .filter((l) => l.item),
    [basket, items],
  );
  const count = lines.reduce((s, l) => s + l.n, 0);
  const total = lines.reduce((s, l) => s + priceOf(l.item) * l.n, 0);

  function bump(id: string, by: number) {
    setBasket((b) => {
      const next = Math.max(0, (b[id] ?? 0) + by);
      return { ...b, [id]: next };
    });
  }

  async function send() {
    if (!table || count === 0) return;
    setSending(true);
    try {
      const { queued, response } = await submit({
        method: "POST",
        url: "/orders",
        kind: "order",
        label: `${table.label} — ${count} item${count === 1 ? "" : "s"}`,
        body: {
          table_id: table.id,
          client_request_id: requestId,
          items: lines.map((l) => ({ menu_item_id: l.item.id, quantity: l.n })),
        },
      });

      if (queued) {
        toast.success(`Saved for ${table.label} — will send when you're back online`);
      } else if (response && !response.ok) {
        // A 4xx is a real refusal, not a network blip. Say what it was.
        let detail = "Could not send that order";
        try {
          detail = (await response.clone().json())?.detail ?? detail;
        } catch {
          /* keep the fallback */
        }
        toast.error(detail);
        setSending(false);
        return;
      } else {
        toast.success(`Sent to the bar — ${table.label}`);
      }

      onPlaced();
      onClose();
    } catch {
      toast.error("Could not send that order");
    } finally {
      setSending(false);
    }
  }

  /* ── Step 1: which table ─────────────────────────────────────────────── */
  if (!table) {
    return (
      <Shell title="Take an order" subtitle="Which table?" onClose={onClose}>
        <div className="px-4 pb-6">
          {byZone.map(([zone, list]) => (
            <div key={zone} className="mb-5">
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--muted)" }}
              >
                {zone}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {list.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTable(t)}
                    className="rounded-xl py-3.5 font-semibold text-sm transition-transform active:scale-95"
                    style={{
                      background: "#111827",
                      border: "1px solid #1E2D42",
                      color: "var(--text)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tables.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
              No tables set up yet.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  /* ── Step 2: what are they having ────────────────────────────────────── */
  return (
    <Shell
      title={table.label}
      subtitle={count > 0 ? `${count} item${count === 1 ? "" : "s"}` : "Add what they asked for"}
      onClose={onClose}
      onBack={() => setTable(null)}
    >
      <div className="px-4 pb-2 sticky top-0 z-10" style={{ background: "var(--bg)" }}>
        <div className="relative mb-2.5">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted)" }}
          />
          <input
            className="input pl-9"
            placeholder="Search the menu"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5">
          {[{ id: "all", name: "All" }, ...cats].map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
              style={{
                background: cat === c.id ? "rgba(0,212,180,0.14)" : "#111827",
                border: `1px solid ${cat === c.id ? "rgba(0,212,180,0.4)" : "#1E2D42"}`,
                color: cat === c.id ? "var(--teal)" : "var(--muted)",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4" style={{ paddingBottom: count > 0 ? 96 : 24 }}>
        {visible.map((item) => {
          const n = basket[item.id] ?? 0;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: "1px solid #1E2D42" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                  {item.name}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {formatNGN(priceOf(item))}
                  {item.item_type === "food" ? " · kitchen" : " · bar"}
                </p>
              </div>

              {n > 0 ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => bump(item.id, -1)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center active:scale-95"
                    style={{ background: "#1A2535", border: "1px solid #1E2D42", color: "var(--text)" }}
                    aria-label={`One less ${item.name}`}
                  >
                    <Minus size={14} />
                  </button>
                  <span
                    className="w-6 text-center font-bold tabular-nums text-sm"
                    style={{ color: "var(--teal)" }}
                  >
                    {n}
                  </span>
                  <button
                    onClick={() => bump(item.id, 1)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center active:scale-95"
                    style={{
                      background: "rgba(0,212,180,0.12)",
                      border: "1px solid rgba(0,212,180,0.35)",
                      color: "var(--teal)",
                    }}
                    aria-label={`One more ${item.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => bump(item.id, 1)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 active:scale-95"
                  style={{ background: "#1A2535", border: "1px solid #1E2D42", color: "var(--teal)" }}
                  aria-label={`Add ${item.name}`}
                >
                  <Plus size={15} />
                </button>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            Nothing matches that.
          </p>
        )}
      </div>

      {count > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{
            background: "rgba(8,13,20,0.96)",
            borderTop: "1px solid #1E2D42",
            backdropFilter: "blur(12px)",
          }}
        >
          <button
            onClick={send}
            disabled={sending}
            className="btn-teal w-full flex items-center justify-between"
            style={{ height: 50 }}
          >
            <span className="flex items-center gap-2">
              <Check size={16} />
              {sending ? "Sending…" : `Send to ${table.label}`}
            </span>
            <span className="tabular-nums font-bold">{formatNGN(total)}</span>
          </button>
        </div>
      )}
    </Shell>
  );
}

/** Full-screen on a phone, because the menu is long and a modal would fight it. */
function Shell({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: "var(--bg)", borderBottom: "1px solid #1E2D42" }}
      >
        {onBack && (
          <button onClick={onBack} style={{ color: "var(--muted)" }} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-base truncate" style={{ color: "var(--text)" }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        </div>
        <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  );
}
