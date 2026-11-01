"use client";

/**
 * The last resort: a crash in the root layout itself, where `error.tsx` cannot
 * help because the layout that would wrap it is the thing that failed.
 *
 * Next requires this component to render its own <html> and <body>, and none of
 * the app's CSS variables are available — so the styling is inline and plain on
 * purpose. It should be impossible for this screen to be the thing that breaks.
 */

import { useEffect } from "react";

import { reportError } from "@/lib/reportError";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "render");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080D14",
          color: "#E8EDF5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.2rem", margin: "0 0 0.6rem" }}>
            EasyServe could not start
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#B0BCCC", margin: "0 0 1.4rem" }}>
            Nothing has been lost. Reload to try again — if it keeps happening,
            tell us and quote the reference below.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#00D4B4",
              color: "#080D14",
              border: 0,
              borderRadius: 12,
              padding: "0.8rem 1.4rem",
              fontSize: "0.95rem",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#6B7A99",
                marginTop: "1.2rem",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
