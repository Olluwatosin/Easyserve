"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";

interface Table {
  id: string;
  label: string;
  qr_token: string;
  zone: string | null;
  is_active: boolean;
}

/* Deliberately outside /owner: that layout wraps its children in a
 * `h-screen overflow-hidden` flex shell with a sidebar, which clips a printout
 * to a single screen. Keeping the sheet at the top level avoids overriding
 * someone else's layout with !important, and there is no chrome to hide.
 */

/** Per-sheet layouts. Sizes are chosen so the QR stays scannable from the
 *  distance each format is actually read at. */
const LAYOUTS = {
  tent: { label: "Table tents", perPage: 2, cols: 1, qr: 260, note: "2 per A4 — fold-over cards for the table" },
  card: { label: "Cards", perPage: 6, cols: 2, qr: 150, note: "6 per A4 — the usual choice" },
  sticker: { label: "Stickers", perPage: 12, cols: 3, qr: 96, note: "12 per A4 — small labels" },
} as const;

type LayoutKey = keyof typeof LAYOUTS;

function PrintableQrSheet() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [venueName, setVenueName] = useState("");
  const [layout, setLayout] = useState<LayoutKey>("card");
  const [zone, setZone] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    Promise.all([
      api.get("/tables").then((r) => r.data as Table[]),
      api.get("/venues/me").then((r) => r.data?.name as string).catch(() => ""),
    ])
      .then(([t, name]) => {
        setTables(t.filter((x) => x.is_active));
        setVenueName(name ?? "");
      })
      .catch(() => toast.error("Could not load tables"))
      .finally(() => setLoading(false));
  }, []);

  const zones = useMemo(
    () => Array.from(new Set(tables.map((t) => t.zone).filter(Boolean))) as string[],
    [tables],
  );

  const visible = useMemo(
    () => (zone === "all" ? tables : tables.filter((t) => t.zone === zone)),
    [tables, zone],
  );

  const cfg = LAYOUTS[layout];
  const sheets = Math.ceil(visible.length / cfg.perPage) || 0;

  if (loading) {
    return (
      <p className="p-8 text-sm" style={{ color: "var(--muted)" }}>
        Loading tables…
      </p>
    );
  }

  return (
    <>
      {/* ── Controls (never printed) ───────────────────────────────────── */}
      <div className="no-print px-5 py-6 max-w-3xl mx-auto space-y-5">
        <button
          onClick={() => router.push("/owner/tables")}
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft size={15} /> Back to tables
        </button>

        <div>
          <h1
            className="font-display text-2xl font-bold"
            style={{ color: "var(--text)" }}
          >
            Print QR codes
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-soft)" }}>
            {visible.length} table{visible.length === 1 ? "" : "s"} ·{" "}
            {sheets} sheet{sheets === 1 ? "" : "s"} of A4
          </p>
        </div>

        {/* The F-11 guard. These codes get printed and stuck to furniture; if the
            domain is wrong, every one of them is dead and has to be reprinted. */}
        <div
          className="rounded-xl p-4 text-xs space-y-2"
          style={{
            background: "rgba(255,149,0,0.07)",
            border: "1px solid rgba(255,149,0,0.28)",
          }}
        >
          <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--amber)" }}>
            <AlertTriangle size={14} /> Check this address before printing
          </p>
          <p style={{ color: "var(--text-soft)" }}>
            Every code below points at{" "}
            <span className="font-mono" style={{ color: "var(--text)" }}>
              {origin}/table/…
            </span>
          </p>
          <p style={{ color: "var(--muted)" }}>
            If you later move to a different web address, printed codes stop
            working and all of them need reprinting. Print from the address you
            intend to keep.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Size
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LAYOUTS) as LayoutKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-left"
                style={{
                  background: layout === key ? "rgba(0,212,180,0.16)" : "transparent",
                  border: `1px solid ${layout === key ? "rgba(0,212,180,0.45)" : "rgba(255,255,255,0.10)"}`,
                  color: layout === key ? "var(--teal)" : "var(--muted)",
                }}
              >
                <span className="block font-semibold">{LAYOUTS[key].label}</span>
                <span className="block mt-0.5">{LAYOUTS[key].note}</span>
              </button>
            ))}
          </div>
        </div>

        {zones.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              Zone
            </p>
            <div className="flex flex-wrap gap-2">
              {["all", ...zones].map((z) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: zone === z ? "rgba(0,212,180,0.16)" : "transparent",
                    border: `1px solid ${zone === z ? "rgba(0,212,180,0.45)" : "rgba(255,255,255,0.10)"}`,
                    color: zone === z ? "var(--teal)" : "var(--muted)",
                  }}
                >
                  {z === "all" ? "All zones" : z}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => window.print()}
          disabled={visible.length === 0}
          className="btn-teal w-full sm:w-auto px-6"
        >
          <Printer size={16} /> Print {visible.length} code
          {visible.length === 1 ? "" : "s"}
        </button>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          In the print dialog, leave &ldquo;Background graphics&rdquo; off — the
          sheet is already black on white to save ink.
        </p>
      </div>

      {/* ── The sheet itself ───────────────────────────────────────────── */}
      <div className="qr-sheet">
        <div
          className="qr-grid"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)` }}
        >
          {visible.map((t) => (
            <figure key={t.id} className="qr-cell">
              <figcaption className="qr-venue">{venueName}</figcaption>
              <p className="qr-label">{t.label}</p>
              {t.zone && <p className="qr-zone">{t.zone}</p>}
              <QRCodeSVG
                value={`${origin}/table/${t.qr_token}`}
                size={cfg.qr}
                level="M"
                marginSize={2}
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
              <p className="qr-instruction">Scan to see the menu &amp; order</p>
              <p className="qr-url">{origin.replace(/^https?:\/\//, "")}</p>
            </figure>
          ))}
        </div>
      </div>

      <style jsx global>{`
        /* On screen the sheet previews as white paper against the dark app. */
        .qr-sheet {
          background: #ffffff;
          color: #000000;
          padding: 10mm;
          margin: 0 auto 3rem;
          max-width: 210mm;
        }
        .qr-grid {
          display: grid;
          gap: 6mm;
        }
        .qr-cell {
          break-inside: avoid;
          page-break-inside: avoid;
          border: 1px dashed #bbbbbb;
          border-radius: 3mm;
          padding: 6mm 4mm;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5mm;
          text-align: center;
        }
        .qr-venue {
          font-size: 9pt;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #555555;
        }
        .qr-label {
          font-size: 18pt;
          font-weight: 700;
          line-height: 1.1;
          margin: 0;
        }
        .qr-zone {
          font-size: 8pt;
          color: #777777;
          margin: 0;
        }
        .qr-instruction {
          font-size: 8.5pt;
          font-weight: 600;
          margin: 1mm 0 0;
        }
        .qr-url {
          font-size: 7pt;
          color: #888888;
          margin: 0;
          font-family: ui-monospace, monospace;
        }

        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }
          /* Chrome keeps the app's dark background otherwise, which is both
             unreadable and a spectacular waste of toner. */
          html,
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print,
          header,
          nav,
          aside {
            display: none !important;
          }
          .qr-sheet {
            padding: 0;
            max-width: none;
            margin: 0;
          }
          .qr-cell {
            border-color: #cccccc;
          }
        }
      `}</style>
    </>
  );
}

export default function PrintQrPage() {
  return (
    <AuthGuard allowedRoles={["owner"]}>
      <PrintableQrSheet />
    </AuthGuard>
  );
}
