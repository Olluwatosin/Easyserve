"use client";

/**
 * What a person sees when a screen crashes.
 *
 * There was no error boundary, so an exception during render produced a blank
 * page. That is the worst possible outcome in this product: a guest mid-order
 * assumes they have lost their round, and a bartender assumes the system is
 * down and goes back to paper for the night.
 *
 * So it says what is still true — the order is safe, the staff can see it — and
 * offers the two things that actually recover: try again, or go back to the
 * start. And it reports itself, because the whole point is that we hear about
 * this without being told.
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { reportError } from "@/lib/reportError";

export default function ErrorScreen({
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
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="card max-w-sm w-full text-center">
        <AlertTriangle
          size={30}
          style={{ color: "var(--amber)", margin: "0 auto 1rem" }}
        />
        <h1
          className="font-display text-xl font-bold mb-2"
          style={{ color: "var(--text)" }}
        >
          This screen stopped working
        </h1>
        <p className="text-sm mb-1" style={{ color: "var(--text-soft)" }}>
          Nothing has been lost — any order already placed is safe and the staff
          can still see it.
        </p>
        <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
          We have been told about this automatically.
        </p>

        <button onClick={reset} className="btn-teal w-full mb-2">
          <RefreshCw size={15} />
          Try again
        </button>
        <a
          href="/"
          className="btn-outline w-full"
          style={{ textDecoration: "none" }}
        >
          Start again
        </a>

        {error.digest && (
          <p
            className="text-xs mt-4 font-mono"
            style={{ color: "var(--muted)" }}
          >
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
