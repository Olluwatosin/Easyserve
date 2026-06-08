"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import AuthGuard from "@/components/AuthGuard";
import { CheckCircle, XCircle, Clock, LogOut, ScanLine } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

type ScanStatus = "valid" | "expired" | "used" | "invalid";

interface ScanResult {
  status: ScanStatus;
  message: string;
  order_id?: string;
}

function SecurityContent() {
  const { user, logout } = useAuthStore();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState("");
  const router = useRouter();
  const scannerRef = useRef<{ clear: () => void } | null>(null);

  async function processToken(token: string) {
    if (!token.trim()) return;
    try {
      const { data } = await api.post(`/exit-pass/scan/${token.trim()}`);
      setResult({ status: data.status, message: data.message, order_id: data.order_id });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Scan failed";
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

  const statusConfig: Record<ScanStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
    valid: {
      icon: <CheckCircle size={64} />,
      color: "text-teal",
      bg: "bg-teal/10 border-teal",
      label: "VALID — Allow Exit",
    },
    used: {
      icon: <XCircle size={64} />,
      color: "text-muted",
      bg: "bg-bg-hover border-border",
      label: "ALREADY USED",
    },
    expired: {
      icon: <Clock size={64} />,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500",
      label: "EXPIRED",
    },
    invalid: {
      icon: <XCircle size={64} />,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500",
      label: "INVALID",
    },
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="bg-bg-surface border-b border-border px-4 py-4 flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-text">Security Scanner</p>
          <p className="text-muted text-xs">{user?.full_name}</p>
        </div>
        <button onClick={() => { logout(); router.replace("/login"); }} className="p-2 text-muted hover:text-red-400">
          <LogOut size={18} />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Scan result display */}
        {result ? (
          <div
            className={`w-full max-w-sm card border-2 flex flex-col items-center py-10 gap-4 ${statusConfig[result.status].bg}`}
          >
            <div className={statusConfig[result.status].color}>
              {statusConfig[result.status].icon}
            </div>
            <p className={`font-display text-2xl font-bold ${statusConfig[result.status].color}`}>
              {statusConfig[result.status].label}
            </p>
            <p className="text-muted text-sm text-center">{result.message}</p>
            <button
              onClick={() => { setResult(null); setManualToken(""); }}
              className="btn-outline mt-2"
            >
              Scan Another
            </button>
          </div>
        ) : (
          <>
            {/* QR scanner area */}
            <div
              id="qr-reader"
              className={`w-full max-w-sm rounded-2xl overflow-hidden border-2 border-dashed ${
                scanning ? "border-teal" : "border-border"
              }`}
              style={{ minHeight: scanning ? 300 : 0 }}
            />

            {!scanning && (
              <button
                onClick={() => setScanning(true)}
                className="btn-teal flex items-center gap-2"
              >
                <ScanLine size={18} />
                Scan QR Code
              </button>
            )}

            {scanning && (
              <button onClick={() => setScanning(false)} className="btn-outline">
                Cancel Scan
              </button>
            )}

            {/* Manual token entry */}
            <div className="w-full max-w-sm">
              <p className="text-muted text-xs text-center mb-2">Or enter token manually</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Paste exit pass token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && processToken(manualToken)}
                />
                <button
                  onClick={() => processToken(manualToken)}
                  disabled={!manualToken.trim()}
                  className="btn-teal px-4"
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
