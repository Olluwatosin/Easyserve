"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import {
  CheckCircle,
  XCircle,
  Clock,
  LogOut,
  ScanLine,
  Shield,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

type ScanStatus = "valid" | "expired" | "used" | "invalid";

interface ScanResult {
  status: ScanStatus;
  message: string;
  order_id?: string;
}

const STATUS_CONFIG: Record<
  ScanStatus,
  { icon: React.ElementType; color: string; bgAccent: string; label: string; sublabel: string }
> = {
  valid: {
    icon: CheckCircle,
    color: "#00D4B4",
    bgAccent: "rgba(0,212,180,0.07)",
    label: "ALLOW EXIT",
    sublabel: "Exit pass verified — guest may leave",
  },
  used: {
    icon: XCircle,
    color: "#6B7A99",
    bgAccent: "rgba(107,122,153,0.06)",
    label: "ALREADY USED",
    sublabel: "This pass was already scanned",
  },
  expired: {
    icon: Clock,
    color: "#f87171",
    bgAccent: "rgba(248,113,113,0.07)",
    label: "EXPIRED",
    sublabel: "Pass has expired — direct to cashier",
  },
  invalid: {
    icon: XCircle,
    color: "#f87171",
    bgAccent: "rgba(248,113,113,0.07)",
    label: "DENY ACCESS",
    sublabel: "Invalid exit pass",
  },
};

function SecurityContent() {
  const { user, logout } = useAuthStore();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState("");
  const router = useRouter();

  async function processToken(token: string) {
    if (!token.trim()) return;
    try {
      const { data } = await api.post(`/exit-pass/scan/${token.trim()}`);
      setResult({
        status: data.status,
        message: data.message,
        order_id: data.order_id,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Scan failed";
      setResult({ status: "invalid", message: msg });
    }
  }

  useEffect(() => {
    if (!scanning) return;
    let html5Qrcode: { start: Function; stop: Function } | null = null;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      html5Qrcode = new Html5Qrcode("qr-reader");
      html5Qrcode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            html5Qrcode?.stop();
            setScanning(false);
            processToken(decodedText);
          },
          () => {}
        )
        .catch(() => {
          toast.error("Camera not available");
          setScanning(false);
        });
    });
    return () => {
      html5Qrcode?.stop().catch(() => {});
    };
  }, [scanning]);

  const cfg = result ? STATUS_CONFIG[result.status] : null;
  const ResultIcon = cfg?.icon;

  return (
    <div
      className="min-h-screen flex flex-col transition-all duration-700"
      style={{
        background: result
          ? result.status === "valid"
            ? "linear-gradient(180deg, #080D14 0%, rgba(0,60,48,0.35) 100%)"
            : result.status === "used"
            ? "var(--bg)"
            : "linear-gradient(180deg, #080D14 0%, rgba(80,18,18,0.35) 100%)"
          : "var(--bg)",
      }}
    >
      {/* ── Header ── */}
      <header
        className="flex-shrink-0 border-b px-5 py-4 flex items-center justify-between"
        style={{
          borderColor: "#1E2D42",
          background: "rgba(8,13,20,0.92)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(0,212,180,0.1)",
              border: "1px solid rgba(0,212,180,0.2)",
            }}
          >
            <Shield size={16} className="text-teal" />
          </div>
          <div>
            <p
              className="font-display font-bold text-sm"
              style={{ color: "var(--text)" }}
            >
              Security
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {user?.full_name}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">

        {result && cfg && ResultIcon ? (
          /* ── Scan result ── */
          <div className="w-full max-w-sm animate-fade-in">
            <div
              className={`rounded-3xl p-10 flex flex-col items-center gap-5 text-center ${
                result.status === "valid" ? "animate-glow-teal" : result.status === "invalid" || result.status === "expired" ? "animate-glow-red" : ""
              }`}
              style={{
                background: cfg.bgAccent,
                border: `2px solid ${cfg.color}40`,
              }}
            >
              <div
                style={{
                  color: cfg.color,
                  filter: `drop-shadow(0 0 18px ${cfg.color}90)`,
                }}
              >
                <ResultIcon size={72} />
              </div>
              <div>
                <p
                  className="font-display text-3xl font-bold"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </p>
                <p
                  className="text-sm mt-2"
                  style={{ color: "var(--text-soft)" }}
                >
                  {cfg.sublabel}
                </p>
                {result.message !== cfg.sublabel && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    {result.message}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setResult(null);
                setManualToken("");
              }}
              className="btn-teal w-full mt-4"
            >
              Scan Next
            </button>
          </div>
        ) : (
          /* ── Scanner UI ── */
          <>
            {/* Scanner frame */}
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                width: 280,
                minHeight: scanning ? 300 : 280,
                background: scanning
                  ? "transparent"
                  : "rgba(0,212,180,0.025)",
                border: scanning ? "none" : "1px solid rgba(0,212,180,0.1)",
              }}
            >
              <div id="qr-reader" className="w-full" />

              {!scanning && (
                <>
                  <div className="corner-tl" />
                  <div className="corner-tr" />
                  <div className="corner-bl" />
                  <div className="corner-br" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center animate-float"
                      style={{
                        background: "rgba(0,212,180,0.07)",
                        border: "1px solid rgba(0,212,180,0.15)",
                      }}
                    >
                      <ScanLine size={28} className="text-teal" />
                    </div>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      Ready to scan
                    </p>
                  </div>
                </>
              )}

              {/* Scan line */}
              {scanning && (
                <div
                  className="absolute left-0 right-0 h-0.5 animate-scan-line pointer-events-none z-10"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #00D4B4, transparent)",
                    boxShadow: "0 0 10px rgba(0,212,180,0.8)",
                  }}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
              {!scanning ? (
                <button
                  onClick={() => setScanning(true)}
                  className="btn-teal w-full py-4 text-base"
                >
                  <ScanLine size={18} />
                  Scan Exit Pass
                </button>
              ) : (
                <button
                  onClick={() => setScanning(false)}
                  className="btn-outline w-full"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Manual token */}
            <div className="w-full max-w-sm">
              <p
                className="text-center text-xs mb-3"
                style={{ color: "var(--muted)" }}
              >
                — or enter token manually —
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Paste exit pass token…"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && processToken(manualToken)
                  }
                />
                <button
                  onClick={() => processToken(manualToken)}
                  disabled={!manualToken.trim()}
                  className="btn-teal px-4 flex-shrink-0"
                >
                  Check
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <AuthGuard allowedRoles={["security", "owner"]}>
      <SecurityContent />
    </AuthGuard>
  );
}
