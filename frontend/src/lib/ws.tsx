"use client";

import { useEffect, useRef, useState } from "react";

export type WSStatus = "connecting" | "open" | "reconnecting";

/**
 * WebSocket hook with automatic reconnection (exponential backoff + jitter).
 *
 * Built for Nigerian venue reality: flaky WiFi and mobile data mean sockets
 * drop mid-service. A plain `new WebSocket()` dies silently and the station
 * stops receiving orders until someone reloads the page.
 *
 * Pass `null` as url to skip (e.g. while auth is still loading).
 */
export function useReconnectingWS(
  url: string | null,
  onMessage: (msg: { event: string; data: Record<string, unknown> }) => void
): WSStatus {
  const [status, setStatus] = useState<WSStatus>("connecting");
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!url) return;
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus(attempts === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempts = 0;
        setStatus("open");
      };

      ws.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data));
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        if (closedByUs) return;
        attempts += 1;
        setStatus("reconnecting");
        // 1s, 2s, 4s, 8s … capped at 15s, with jitter to avoid thundering herd
        const delay = Math.min(1000 * 2 ** (attempts - 1), 15000) + Math.random() * 500;
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [url]);

  return status;
}

/** Slim status pill for staff stations — visible only when the link is down. */
export function ConnectionBanner({ status }: { status: WSStatus }) {
  if (status === "open") return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 text-center text-xs font-semibold py-1.5"
      style={{ background: "#B45309", color: "#FFF7ED" }}
    >
      {status === "connecting" ? "Connecting…" : "Connection lost — reconnecting…"}
    </div>
  );
}
