/**
 * Sanitised public endpoints.
 *
 * NEXT_PUBLIC_* values are typed or pasted into a hosting dashboard by hand and
 * are compiled into the bundle at build time, so a stray character is invisible
 * until every request 404s. A real deploy shipped with
 *
 *   NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1 │"
 *
 * — a trailing space and a box-drawing character picked up when the value was
 * copied out of a formatted table. Requests went to `/api/v1%20%E2%94%82/...`.
 *
 * Strip anything that cannot legitimately appear in a URL, plus trailing
 * slashes so callers can always concatenate `/path` safely.
 */
function clean(raw: string | undefined, fallback: string): string {
  const value = (raw ?? fallback)
    // Drop whitespace and everything outside printable ASCII (catches │, NBSP,
    // zero-width characters, smart quotes — the usual copy-paste debris).
    .replace(/[^\x21-\x7E]/g, "")
    .replace(/\/+$/, "");
  return value || fallback;
}

/** Base URL for REST calls, e.g. https://api.example.com/api/v1 */
export const API_URL = clean(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:8000/api/v1",
);

/** Base URL for WebSocket connections, e.g. wss://api.example.com */
export const WS_URL = clean(
  process.env.NEXT_PUBLIC_WS_URL,
  "ws://localhost:8000",
);
