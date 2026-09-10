"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Minus,
  Package,
  Plus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";

interface StockItem {
  item_id: string;
  name: string;
  item_type: string;
  price: number;
  stock_quantity: number;
  stock_pack_size: number;
  stock_threshold: number;
  is_low: boolean;
  is_out: boolean;
  value: number;
}

interface CountLine {
  item_id: string;
  name: string;
  expected: number;
  counted: number;
  variance: number;
  variance_value: number;
}

interface CountResult {
  lines: CountLine[];
  discrepancies: CountLine[];
  shrinkage_value: number;
  items_counted: number;
}

/** Beer arrives, is stored and is counted by the crate. Asking someone to
 *  type "293" at 2am invites exactly the error the count exists to catch, so
 *  case goods are entered as crates plus whatever is loose. */
function splitPacks(units: number, pack: number) {
  if (pack <= 1) return { packs: 0, loose: units };
  return { packs: Math.floor(units / pack), loose: units % pack };
}

function describeStock(units: number, pack: number): string {
  if (pack <= 1) return String(units);
  const { packs, loose } = splitPacks(units, pack);
  if (packs === 0) return `${loose}`;
  return loose === 0 ? `${packs} × ${pack}` : `${packs} × ${pack} + ${loose}`;
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [packCounts, setPackCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CountResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<StockItem[]>("/stock");
      setItems(data);
    } catch {
      toast.error("Could not load stock");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(
    () => ({
      value: items.reduce((s, i) => s + i.value, 0),
      low: items.filter((i) => i.is_low && !i.is_out).length,
      out: items.filter((i) => i.is_out).length,
    }),
    [items],
  );

  async function adjust(item: StockItem, delta: number, reason: string) {
    try {
      await api.patch(`/stock/${item.item_id}`, { delta, reason });
      await load();
    } catch {
      toast.error(`Could not update ${item.name}`);
    }
  }

  async function submitCount() {
    const payload: Record<string, number> = {};
    for (const item of items) {
      const looseRaw = counts[item.item_id] ?? "";
      const packRaw = packCounts[item.item_id] ?? "";
      if (looseRaw.trim() === "" && packRaw.trim() === "") continue;

      const loose = looseRaw.trim() === "" ? 0 : Number(looseRaw);
      const packs = packRaw.trim() === "" ? 0 : Number(packRaw);
      if (
        !Number.isInteger(loose) || loose < 0 ||
        !Number.isInteger(packs) || packs < 0
      ) {
        toast.error("Counts must be whole numbers, zero or more");
        return;
      }
      payload[item.item_id] = packs * (item.stock_pack_size || 1) + loose;
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Enter at least one count");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<CountResult>("/stock/count", { counts: payload });
      setResult(data);
      setCounting(false);
      setCounts({});
      setPackCounts({});
      await load();
    } catch {
      toast.error("Could not save the count");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="p-8 text-sm" style={{ color: "var(--muted)" }}>
        Loading stock…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Stock
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Nothing is being counted yet. Stock tracking suits items that come in
          units you can count — bottles, packages, cans. Cocktails mixed to order
          and kitchen plates are usually left untracked.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
            Stock
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-soft)" }}>
            {items.length} tracked items · {formatNGN(totals.value)} on the shelf
          </p>
        </div>
        <button onClick={() => setCounting((v) => !v)} className="btn-teal px-5">
          <ClipboardCheck size={16} />
          {counting ? "Cancel count" : "Start nightly count"}
        </button>
      </div>

      {(totals.out > 0 || totals.low > 0) && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center gap-2.5"
          style={{
            background: "rgba(255,149,0,0.07)",
            border: "1px solid rgba(255,149,0,0.28)",
            color: "var(--text-soft)",
          }}
        >
          <AlertTriangle size={15} style={{ color: "var(--amber)", flexShrink: 0 }} />
          <span>
            {totals.out > 0 && <strong>{totals.out} out of stock</strong>}
            {totals.out > 0 && totals.low > 0 && " · "}
            {totals.low > 0 && <>{totals.low} running low</>}
          </span>
        </div>
      )}

      {/* ── Variance result ─────────────────────────────────────────────── */}
      {result && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "rgba(15,25,35,0.58)", backdropFilter: "blur(14px)",
            border: `1px solid ${
              result.shrinkage_value > 0 ? "rgba(248,113,113,0.3)" : "rgba(0,212,180,0.3)"
            }`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold" style={{ color: "var(--text)" }}>
                Count complete
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-soft)" }}>
                {result.items_counted} counted · {result.discrepancies.length} did not match
              </p>
            </div>
            <button onClick={() => setResult(null)} style={{ color: "var(--muted)" }}>
              <X size={18} />
            </button>
          </div>

          {result.shrinkage_value > 0 ? (
            <p className="text-sm" style={{ color: "#f87171" }}>
              <strong>{formatNGN(result.shrinkage_value)}</strong> of stock is
              missing — sold or removed without being recorded.
            </p>
          ) : (
            <p className="text-sm" style={{ color: "var(--teal)" }}>
              Everything matched the records.
            </p>
          )}

          {result.discrepancies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 460 }}>
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th className="text-left font-medium pb-2">Item</th>
                    <th className="text-right font-medium pb-2">System</th>
                    <th className="text-right font-medium pb-2">Counted</th>
                    <th className="text-right font-medium pb-2">Diff</th>
                    <th className="text-right font-medium pb-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.discrepancies.map((l) => (
                    <tr key={l.item_id} style={{ borderTop: "1px solid #1E2D42" }}>
                      <td className="py-2" style={{ color: "var(--text-soft)" }}>{l.name}</td>
                      <td className="py-2 text-right tabular-nums" style={{ color: "var(--muted)" }}>{l.expected}</td>
                      <td className="py-2 text-right tabular-nums" style={{ color: "var(--text)" }}>{l.counted}</td>
                      <td
                        className="py-2 text-right tabular-nums font-semibold"
                        style={{ color: l.variance < 0 ? "#f87171" : "var(--teal)" }}
                      >
                        {l.variance > 0 ? `+${l.variance}` : l.variance}
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: l.variance < 0 ? "#f87171" : "var(--teal)" }}
                      >
                        {formatNGN(l.variance_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── The list ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(15,25,35,0.58)", backdropFilter: "blur(14px)", border: "1px solid rgba(120,160,180,0.16)" }}
      >
        {items.map((item, i) => (
          <div
            key={item.item_id}
            className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap"
            style={{ borderTop: i > 0 ? "1px solid #1E2D42" : "none" }}
          >
            <Package
              size={15}
              style={{
                color: item.is_out ? "#f87171" : item.is_low ? "var(--amber)" : "var(--muted)",
                flexShrink: 0,
              }}
            />
            <div className="flex-1 min-w-[140px]">
              <p className="text-sm" style={{ color: "var(--text-soft)" }}>{item.name}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {formatNGN(item.price)} · reorder at {item.stock_threshold}
                {item.stock_pack_size > 1 && ` · crate of ${item.stock_pack_size}`}
              </p>
            </div>

            {counting ? (
              item.stock_pack_size > 1 ? (
                <div className="flex items-center gap-1.5">
                  <input
                    className="input w-16 text-center tabular-nums"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={String(splitPacks(item.stock_quantity, item.stock_pack_size).packs)}
                    value={packCounts[item.item_id] ?? ""}
                    onChange={(e) =>
                      setPackCounts((c) => ({ ...c, [item.item_id]: e.target.value }))
                    }
                    aria-label={`Crates of ${item.name}`}
                  />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    ×{item.stock_pack_size} +
                  </span>
                  <input
                    className="input w-16 text-center tabular-nums"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={String(splitPacks(item.stock_quantity, item.stock_pack_size).loose)}
                    value={counts[item.item_id] ?? ""}
                    onChange={(e) =>
                      setCounts((c) => ({ ...c, [item.item_id]: e.target.value }))
                    }
                    aria-label={`Loose bottles of ${item.name}`}
                  />
                </div>
              ) : (
                <input
                  className="input w-24 text-center tabular-nums"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={String(item.stock_quantity)}
                  value={counts[item.item_id] ?? ""}
                  onChange={(e) =>
                    setCounts((c) => ({ ...c, [item.item_id]: e.target.value }))
                  }
                />
              )
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjust(item, -(item.stock_pack_size || 1), "waste")}
                  title={
                    item.stock_pack_size > 1
                      ? `Remove one crate of ${item.stock_pack_size}`
                      : "Record one wasted or broken"
                  }
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ border: "1px solid rgba(120,160,180,0.16)", color: "var(--muted)" }}
                >
                  <Minus size={14} />
                </button>
                <span
                  className="min-w-[5.5rem] text-center text-sm font-semibold tabular-nums"
                  style={{
                    color: item.is_out ? "#f87171" : item.is_low ? "var(--amber)" : "var(--text)",
                  }}
                >
                  {describeStock(item.stock_quantity, item.stock_pack_size)}
                </span>
                <button
                  onClick={() => adjust(item, item.stock_pack_size || 1, "restock")}
                  title={
                    item.stock_pack_size > 1
                      ? `Add one crate of ${item.stock_pack_size}`
                      : "Add one to stock"
                  }
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ border: "1px solid rgba(120,160,180,0.16)", color: "var(--muted)" }}
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {counting && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={submitCount} disabled={busy} className="btn-teal px-6">
            {busy ? "Saving…" : "Save count"}
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Enter what is physically on the shelf. Case goods take crates and
            loose bottles separately. Leave a row blank to skip it — only what
            you count is compared.
          </p>
        </div>
      )}
    </div>
  );
}
