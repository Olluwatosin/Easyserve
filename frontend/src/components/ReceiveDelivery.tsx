"use client";

/**
 * Booking in a supplier delivery.
 *
 * Built for someone standing over a crate with a waybill in the other hand, so
 * it follows the paper rather than the database: search for the line, type the
 * quantity in the units the invoice uses, move on. The running total at the
 * foot is what the delivery cost, which is the number to check against the
 * invoice before anything is committed.
 *
 * Cost is asked for on every line and remembered from last time, because a
 * delivery is the one moment the venue is holding proof of what something now
 * costs. Left blank it changes nothing — silence is not "free".
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Search, Truck, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";

interface StockItem {
  item_id: string;
  name: string;
  unit_cost: number | null;
  stock_quantity: number;
  stock_pack_size: number;
  /** False until this item has ever been counted or received. */
  tracked: boolean;
  item_type: string;
}

interface Line {
  packs: string;
  units: string;
  cost: string;
}

const EMPTY: Line = { packs: "", units: "", cost: "" };

export function ReceiveDelivery({
  onClose,
  onReceived,
}: {
  onClose: () => void;
  onReceived: () => void;
}) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [q, setQ] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"all" | "drink" | "food">("all");

  useEffect(() => {
    // The whole menu, not just what is already stock-tracked. A venue that has
    // just imported its menu has nothing tracked at all — every item's level is
    // unknown until something is received or counted — so loading /stock here
    // showed an empty list and told the owner to add items that were already
    // on the menu. Receiving an untracked item starts tracking it, which makes
    // this screen the natural place to open the books on a new bar.
    api
      .get("/menu/items")
      .then((r) =>
        setItems(
          (r.data as Array<Record<string, unknown>>).map((m) => ({
            item_id: String(m.id),
            name: String(m.name),
            unit_cost: (m.unit_cost as number | null) ?? null,
            stock_quantity: (m.stock_quantity as number | null) ?? 0,
            stock_pack_size: (m.stock_pack_size as number) || 1,
            tracked: m.stock_quantity !== null && m.stock_quantity !== undefined,
            item_type: String(m.item_type ?? "other"),
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => kind === "all" || i.item_type === kind)
      .filter((i) => !term || i.name.toLowerCase().includes(term));
  }, [items, q, kind]);

  function set(id: string, field: keyof Line, value: string) {
    setLines((l) => ({ ...l, [id]: { ...(l[id] ?? EMPTY), [field]: value } }));
  }

  /** Lines with something actually on them. */
  const filled = useMemo(
    () =>
      Object.entries(lines)
        .map(([id, l]) => ({ id, l, item: items.find((i) => i.item_id === id) }))
        .filter(
          (r) =>
            r.item && (Number(r.l.packs) > 0 || Number(r.l.units) > 0),
        ),
    [lines, items],
  );

  const totals = useMemo(() => {
    let units = 0;
    let value = 0;
    let allPriced = true;
    for (const { l, item } of filled) {
      const n =
        (Number(l.packs) || 0) * (item!.stock_pack_size || 1) + (Number(l.units) || 0);
      units += n;
      const cost = l.cost.trim() !== "" ? Number(l.cost) : item!.unit_cost;
      if (cost == null || !isFinite(cost)) allPriced = false;
      else value += cost * n;
    }
    return { units, value, allPriced };
  }, [filled]);

  async function submit() {
    if (filled.length === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post("/stock/receive", {
        supplier: supplier.trim() || null,
        reference: reference.trim() || null,
        lines: filled.map(({ id, l }) => ({
          item_id: id,
          packs: Number(l.packs) || 0,
          units: Number(l.units) || 0,
          unit_cost: l.cost.trim() === "" ? null : Number(l.cost),
        })),
      });

      const changed = data.lines.filter((l: { cost_changed: unknown }) => l.cost_changed);
      toast.success(
        `Booked in ${data.units_received} units across ${data.items_received} items`,
      );
      if (changed.length) {
        // Worth saying out loud: a cost change quietly alters every margin and
        // stock valuation that follows it.
        toast(`Cost updated on ${changed.length} item${changed.length === 1 ? "" : "s"}`, {
          icon: "₦",
        });
      }
      onReceived();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Could not book in that delivery";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: "var(--bg)", borderBottom: "1px solid #1E2D42" }}
      >
        <Truck size={17} style={{ color: "var(--teal)" }} />
        <div className="flex-1">
          <p className="font-display font-bold text-base" style={{ color: "var(--text)" }}>
            Book in a delivery
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Enter what arrived, in crates or single units
          </p>
        </div>
        <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-40 pt-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-text-soft text-sm mb-1.5">Supplier</label>
            <input
              className="input"
              placeholder="e.g. Ikeja Drinks"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-text-soft text-sm mb-1.5">Invoice / waybill no.</label>
            <input
              className="input"
              placeholder="e.g. WB-4471"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          {([["all", "Everything"], ["drink", "Drinks"], ["food", "Food"]] as const).map(
            ([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: kind === k ? "rgba(0,212,180,0.13)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${kind === k ? "rgba(0,212,180,0.38)" : "#1E2D42"}`,
                  color: kind === k ? "var(--teal)" : "var(--muted)",
                }}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted)" }}
          />
          <input
            className="input pl-9"
            placeholder="Find the item on the invoice"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(15,25,35,0.58)", border: "1px solid #1E2D42" }}
        >
          {visible.map((item, i) => {
            const l = lines[item.item_id] ?? EMPTY;
            const n =
              (Number(l.packs) || 0) * (item.stock_pack_size || 1) + (Number(l.units) || 0);
            return (
              <div
                key={item.item_id}
                className="px-4 py-3"
                style={{
                  borderTop: i > 0 ? "1px solid #1E2D42" : "none",
                  background: n > 0 ? "rgba(0,212,180,0.05)" : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {item.name}
                  </p>
                  <p className="text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {item.tracked ? `${item.stock_quantity} on hand` : "not counted yet"}
                    {item.stock_pack_size > 1 && ` · crate of ${item.stock_pack_size}`}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {item.stock_pack_size > 1 && (
                    <LabelledInput
                      label={`Crates of ${item.stock_pack_size}`}
                      value={l.packs}
                      onChange={(v) => set(item.item_id, "packs", v)}
                    />
                  )}
                  <LabelledInput
                    label={item.stock_pack_size > 1 ? "Loose units" : "Units"}
                    value={l.units}
                    onChange={(v) => set(item.item_id, "units", v)}
                  />
                  <LabelledInput
                    label="Cost each (₦)"
                    value={l.cost}
                    placeholder={item.unit_cost == null ? "not set" : String(item.unit_cost)}
                    onChange={(v) => set(item.item_id, "cost", v)}
                  />
                </div>

                {n > 0 && (
                  <p className="text-xs mt-1.5" style={{ color: "var(--teal)" }}>
                    {n} units in · takes {item.name} to {item.stock_quantity + n}
                  </p>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
              Nothing matches that. An item has to be on the menu before it can be
            received — add it under Menu first.
            </p>
          )}
        </div>
      </div>

      {filled.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{
            background: "rgba(8,13,20,0.96)",
            borderTop: "1px solid #1E2D42",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span style={{ color: "var(--muted)" }}>
                {filled.length} line{filled.length === 1 ? "" : "s"} · {totals.units} units
              </span>
              <span style={{ color: totals.allPriced ? "var(--text-soft)" : "var(--amber)" }}>
                {totals.allPriced
                  ? `${formatNGN(totals.value)} — check against the invoice`
                  : `${formatNGN(totals.value)} so far · some lines have no cost`}
              </span>
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="btn-teal w-full"
              style={{ height: 50 }}
            >
              <Check size={16} /> {busy ? "Booking in…" : "Book in this delivery"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LabelledInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <input
        className="input tabular-nums"
        inputMode="numeric"
        placeholder={placeholder ?? "0"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      />
    </div>
  );
}
