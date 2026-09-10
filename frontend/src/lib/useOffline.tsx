"use client";

import { useCallback, useEffect, useState } from "react";

import { API_URL } from "@/lib/env";
import {
  QueuedRequest,
  enqueue,
  flush,
  listPending,
  newRequestId,
  onPendingChange,
} from "@/lib/offline";

/** Replay a queued request against the API, carrying auth if we have it. */
async function send(r: QueuedRequest): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${r.url}`, {
    method: r.method,
    headers,
    body: JSON.stringify(r.body),
  });
}

export interface OfflineState {
  online: boolean;
  pending: QueuedRequest[];
  /** Try the request now; queue it if the network is unavailable. */
  submit: (
    input: Omit<QueuedRequest, "id" | "queuedAt" | "attempts">,
  ) => Promise<{ queued: boolean; response?: Response }>;
  flushNow: () => Promise<void>;
}

export function useOffline(): OfflineState {
  // Assume online until the browser says otherwise, so the first render of a
  // normally-connected page never flashes an offline warning.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueuedRequest[]>([]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const unsubscribe = onPendingChange(setPending);
    listPending().then(setPending);

    const goOnline = () => {
      setOnline(true);
      flush(send);
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // navigator.onLine only reports whether the device has *a* network, not
    // whether our API is reachable — captive portals and a dead backend both
    // read as "online". Retrying on a timer covers what the event misses.
    const timer = setInterval(() => {
      if (navigator.onLine) flush(send);
    }, 20_000);

    if (navigator.onLine) flush(send);

    return () => {
      unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, []);

  const submit = useCallback<OfflineState["submit"]>(async (input) => {
    const id = input.body && typeof input.body === "object" && "client_request_id" in input.body
      ? String((input.body as Record<string, unknown>).client_request_id)
      : newRequestId();
    const req: QueuedRequest = { ...input, id, queuedAt: Date.now(), attempts: 0 };

    if (!navigator.onLine) {
      await enqueue(req);
      return { queued: true };
    }

    try {
      const response = await send(req);
      if (response.ok) return { queued: false, response };
      // A 4xx is a real rejection — surface it rather than hiding it in a queue
      // that will replay it to the same answer forever.
      if (response.status >= 400 && response.status < 500) {
        return { queued: false, response };
      }
      await enqueue(req);
      return { queued: true, response };
    } catch {
      // Network died between the check and the call.
      await enqueue(req);
      return { queued: true };
    }
  }, []);

  const flushNow = useCallback(async () => {
    await flush(send);
  }, []);

  return { online, pending, submit, flushNow };
}

/** A quiet, honest banner: only shown when something is actually wrong. */
export function OfflineBanner({ state }: { state: OfflineState }) {
  const { online, pending } = state;
  if (online && pending.length === 0) return null;

  const offline = !online;
  return (
    <div
      role="status"
      className="fixed bottom-0 inset-x-0 z-50 px-4 py-2.5 text-sm flex items-center justify-center gap-2 text-center"
      style={{
        background: offline ? "rgba(255,149,0,0.16)" : "rgba(0,212,180,0.14)",
        borderTop: `1px solid ${offline ? "rgba(255,149,0,0.45)" : "rgba(0,212,180,0.4)"}`,
        color: offline ? "var(--amber)" : "var(--teal)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: "currentColor" }}
      />
      {offline ? (
        <span>
          No connection.{" "}
          {pending.length > 0
            ? `${pending.length} waiting to send — they will go through when the network returns.`
            : "Your work is being saved and will send when the network returns."}
        </span>
      ) : (
        <span>Sending {pending.length} saved {pending.length === 1 ? "item" : "items"}…</span>
      )}
    </div>
  );
}
