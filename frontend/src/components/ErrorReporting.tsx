"use client";

/**
 * Installs the window-level error hooks, once, from the root layout.
 *
 * React's error boundaries only catch what throws during rendering. Most of this
 * app's work happens elsewhere — event handlers, socket callbacks, the offline
 * queue replaying — and an exception in any of those never reaches a boundary.
 * These two listeners are what close that gap.
 */

import { useEffect } from "react";

import { installGlobalErrorReporting } from "@/lib/reportError";

export function ErrorReporting() {
  useEffect(installGlobalErrorReporting, []);
  return null;
}
