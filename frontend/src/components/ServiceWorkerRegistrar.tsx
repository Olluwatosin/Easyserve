"use client";

import { useEffect } from "react";

/** Registers the offline-resilience service worker (production only). */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is progressive enhancement — never block the app */
      });
    }
  }, []);
  return null;
}
