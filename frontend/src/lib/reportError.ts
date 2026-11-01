/**
 * Telling us when something broke on somebody else's phone.
 *
 * The backend had Sentry and the browser had nothing, so a crash mid-order was
 * invisible: the guest saw a blank screen, closed the tab, and nobody ever
 * knew. Every real defect in this product so far was found by a person using
 * it, which makes this the most useful instrument missing from it.
 *
 * Deliberately not the Sentry SDK. Reports go to our own API, which already has
 * Sentry configured — one DSN to manage instead of two, no extra kilobytes in a
 * bundle that loads over 3G, and nothing third-party running on a guest's phone.
 *
 * Everything here is written so that a broken page cannot be made worse:
 * failures are swallowed, the same error is never sent twice, and the whole
 * thing is capped per session. A guest with a crash loop must not generate a
 * thousand requests from a phone they are paying for the data on.
 */

import { API_URL } from "./env";

type Kind = "render" | "window" | "promise";

/** Most a single session will ever send. A crash loop is one bug, not two hundred. */
const MAX_PER_SESSION = 8;

let sent = 0;
const alreadySeen = new Set<string>();

function fingerprint(message: string, stack?: string): string {
  // First stack frame is enough to tell two different bugs apart without
  // treating every re-render of the same one as new.
  const frame = (stack ?? "").split("\n")[1]?.trim() ?? "";
  return `${message}::${frame}`;
}

export function reportError(
  error: unknown,
  kind: Kind = "window",
): void {
  try {
    if (sent >= MAX_PER_SESSION) return;

    const err = error as { message?: string; stack?: string } | undefined;
    const message = String(err?.message ?? error ?? "Unknown error").slice(0, 500);
    const stack = err?.stack?.slice(0, 4000);

    const key = fingerprint(message, stack);
    if (alreadySeen.has(key)) return;
    alreadySeen.add(key);
    sent += 1;

    // The pathname only. The query string is excluded because a guest's bill
    // URL carries their session token, and this would copy it into our logs.
    const path =
      typeof window === "undefined" ? undefined : window.location.pathname;

    const body = JSON.stringify({
      message,
      stack,
      kind,
      path,
      user_agent:
        typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 500),
      release: process.env.NEXT_PUBLIC_RELEASE ?? undefined,
    });

    const url = `${API_URL}/telemetry/client-error`;

    // sendBeacon survives the page being closed, which is exactly what a guest
    // does when the screen goes blank — the moment the report matters most.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* reporting a crash must never cause one */
    });
  } catch {
    /* as above — this function may not throw, ever */
  }
}

/**
 * Catch what React's error boundaries do not: errors thrown outside rendering,
 * and promise rejections nobody handled. Both are common in this app, which
 * does most of its work in event handlers and sockets rather than in render.
 */
export function installGlobalErrorReporting(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __esErrorsInstalled?: boolean };
  if (w.__esErrorsInstalled) return;
  w.__esErrorsInstalled = true;

  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, "window");
  });

  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, "promise");
  });
}
