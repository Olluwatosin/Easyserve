"use client";

/**
 * Loading a menu out of the file the venue already has it in.
 *
 * The upload is the easy half. This screen is the other half, and it is the
 * reason supporting PDF is defensible at all: nothing reaches the menu until a
 * person has looked at it.
 *
 * A CSV with named columns is exact. A Word table is usually right. A PDF is a
 * guess — columns interleave, decorative fonts extract as nonsense — so rows
 * the parser was unsure about are sorted to the top and marked, and anything
 * without a price cannot be imported until someone types one.
 *
 * The alternative to a review step is not "a faster import". It is forty items
 * at plausible-looking wrong prices, found by a guest.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { formatNGN } from "@/lib/utils";

type ItemType = "drink" | "food" | "other";

interface Row {
  name: string;
  price: number | null;
  unit_cost: number | null;
  category: string | null;
  item_type: ItemType;
  pack_size: number;
  confidence: string;
  keep: boolean;
}

export function MenuImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState("");
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/menu/import/parse", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const parsed: Row[] = data.items.map(
        (i: Omit<Row, "keep">) => ({
          ...i,
          // A row with no price cannot be imported, so it starts unticked
          // rather than silently importing at zero.
          keep: i.price != null && i.price > 0,
        }),
      );
      // Doubtful rows first: they are the ones that need a human, and a review
      // screen that buries them is a review screen nobody really does.
      parsed.sort((a, b) => {
        const rank = (r: Row) => (r.price == null ? 0 : r.confidence === "high" ? 2 : 1);
        return rank(a) - rank(b);
      });

      setRows(parsed);
      setSource(data.source);
      setUnreadable(data.unreadable ?? []);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Could not read that file";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof Row>(idx: number, key: K, value: Row[K]) {
    setRows((r) => r && r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  const keeping = useMemo(() => (rows ?? []).filter((r) => r.keep && r.price), [rows]);
  const unpriced = useMemo(() => (rows ?? []).filter((r) => !r.price).length, [rows]);

  async function commit() {
    if (keeping.length === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post("/menu/import/commit", {
        items: keeping.map((r) => ({
          name: r.name.trim(),
          price: r.price,
          unit_cost: r.unit_cost,
          category: r.category?.trim() || null,
          item_type: r.item_type,
          pack_size: r.pack_size || 1,
        })),
      });
      toast.success(`${data.created} items added to your menu`);
      if (data.skipped > 0) {
        toast(`${data.skipped} already on the menu — left alone`, { icon: "↩" });
      }
      onImported();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Could not add those items";
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
        <FileUp size={17} style={{ color: "var(--teal)" }} />
        <div className="flex-1">
          <p className="font-display font-bold text-base" style={{ color: "var(--text)" }}>
            Import a menu
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {rows ? `Read from your ${source.toUpperCase()} — check it before adding` : "CSV, Word or PDF"}
          </p>
        </div>
        <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6" style={{ paddingBottom: rows ? 120 : 40 }}>
        {!rows ? (
          <>
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(15,25,35,0.58)", border: "1px dashed #2A3D52" }}
            >
              <FileUp size={26} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
              <p className="text-sm mb-1" style={{ color: "var(--text)" }}>
                Upload the menu file
              </p>
              <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
                Spreadsheet, Word document or PDF — up to 4 MB
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.docx,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="btn-teal px-6"
              >
                {busy ? "Reading…" : "Choose a file"}
              </button>
            </div>

            <div
              className="mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2D42", color: "var(--muted)" }}
            >
              <p style={{ color: "var(--text-soft)", fontWeight: 600, marginBottom: 4 }}>
                What reads best
              </p>
              A spreadsheet saved as CSV with <strong>Name</strong> and{" "}
              <strong>Price</strong> columns imports exactly — add{" "}
              <strong>Cost</strong> and <strong>Category</strong> columns and those
              come in too. Word menus usually read well. A PDF is read as best it
              can be and always needs checking; a scanned or photographed menu has
              no text in it and cannot be read at all.
              <br />
              <br />
              Nothing is added to your menu until you press the button at the
              bottom of the next screen.
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-sm" style={{ color: "var(--text-soft)" }}>
                {rows.length} rows found · {keeping.length} selected
              </span>
              {unpriced > 0 && (
                <span
                  className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                  style={{
                    background: "rgba(255,179,71,0.1)",
                    border: "1px solid rgba(255,179,71,0.3)",
                    color: "var(--amber)",
                  }}
                >
                  <AlertTriangle size={12} /> {unpriced} without a price — add one or leave unticked
                </span>
              )}
            </div>

            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(15,25,35,0.58)", border: "1px solid #1E2D42" }}
            >
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="px-3 py-2.5 grid gap-2 items-center"
                  style={{
                    gridTemplateColumns: "26px minmax(0,2fr) 92px 92px minmax(0,1fr) 84px 28px",
                    borderTop: i > 0 ? "1px solid #1E2D42" : "none",
                    background: !row.price
                      ? "rgba(255,179,71,0.05)"
                      : row.confidence !== "high"
                        ? "rgba(255,255,255,0.02)"
                        : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={row.keep}
                    disabled={!row.price}
                    onChange={(e) => set(i, "keep", e.target.checked)}
                    style={{ accentColor: "#00D4B4", width: 16, height: 16 }}
                    aria-label={`Import ${row.name}`}
                  />
                  <input
                    className="input"
                    style={{ height: 36 }}
                    value={row.name}
                    onChange={(e) => set(i, "name", e.target.value)}
                  />
                  <input
                    className="input tabular-nums"
                    style={{ height: 36 }}
                    inputMode="numeric"
                    placeholder="price"
                    value={row.price ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      set(i, "price", v === "" ? null : Number(v));
                      if (v !== "") set(i, "keep", true);
                    }}
                  />
                  <input
                    className="input tabular-nums"
                    style={{ height: 36 }}
                    inputMode="numeric"
                    placeholder="cost"
                    value={row.unit_cost ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      set(i, "unit_cost", v === "" ? null : Number(v));
                    }}
                  />
                  <input
                    className="input"
                    style={{ height: 36 }}
                    placeholder="category"
                    value={row.category ?? ""}
                    onChange={(e) => set(i, "category", e.target.value)}
                  />
                  <select
                    className="input"
                    style={{ height: 36 }}
                    value={row.item_type}
                    onChange={(e) => set(i, "item_type", e.target.value as ItemType)}
                  >
                    <option value="drink">Drink</option>
                    <option value="food">Food</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    onClick={() => setRows((r) => r && r.filter((_, j) => j !== i))}
                    style={{ color: "var(--muted)" }}
                    aria-label={`Remove ${row.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {unreadable.length > 0 && (
              <div
                className="mt-4 rounded-xl px-4 py-3 text-xs"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2D42" }}
              >
                <p style={{ color: "var(--text-soft)", fontWeight: 600, marginBottom: 6 }}>
                  {unreadable.length} lines couldn&apos;t be read
                </p>
                <p style={{ color: "var(--muted)", marginBottom: 8 }}>
                  Shown so you can see what was missed rather than wonder. Add any
                  of these by hand after importing.
                </p>
                <div style={{ color: "var(--muted)", maxHeight: 140, overflowY: "auto" }}>
                  {unreadable.map((l, i) => (
                    <div key={i} className="truncate">· {l}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {rows && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{
            background: "rgba(8,13,20,0.96)",
            borderTop: "1px solid #1E2D42",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button
              onClick={() => setRows(null)}
              className="px-4 py-3 rounded-xl text-sm"
              style={{ border: "1px solid #1E2D42", color: "var(--muted)" }}
            >
              Start over
            </button>
            <button
              onClick={commit}
              disabled={busy || keeping.length === 0}
              className="btn-teal flex-1"
              style={{ height: 50 }}
            >
              <Check size={16} />
              {busy
                ? "Adding…"
                : `Add ${keeping.length} item${keeping.length === 1 ? "" : "s"} to the menu`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
