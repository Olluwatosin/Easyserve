"use client";

/**
 * The venue's live channel, described by what each event *changes* rather than
 * by its name.
 *
 * Five screens used to hand-roll their own socket handler, each listing the
 * event names it happened to know about. That failed twice in the same way: the
 * server broadcast `order_item_update` on every item transition and four of the
 * five screens simply never listened, so a bartender accepting a ticket left
 * the floor stale and — worse — a table finishing its last item never moved
 * into the cashier's pay queue.
 *
 * Nothing was broken. Something was merely *not mentioned*, in four places, and
 * an omission leaves no trace to review.
 *
 * So screens no longer name events. They say which of their data a change
 * should invalidate:
 *
 *     useVenueChannel(venueId, { onOrders: loadOrders, onAlerts: loadAlerts })
 *
 * A new server event is classified once, here, and every screen that reads that
 * data picks it up. `tests/test_realtime_events.py` fails the build if the
 * backend broadcasts an event this file does not classify, so forgetting is
 * caught rather than shipped.
 */

import { useMemo } from "react";

import { WS_URL } from "@/lib/env";
import { useReconnectingWS, type WSStatus } from "@/lib/ws";

export interface VenueEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Every event the venue channel carries, grouped by the data it invalidates.
 *
 * An event may appear in more than one group — `payment_recorded` changes an
 * order's status and settles what a table owes. Keep this exhaustive; the test
 * enforces it.
 */
export const INVALIDATES = {
  /** Anything that changes an order, its items, or what a table owes. */
  orders: [
    "new_order_attendant",
    "new_order_bar",
    "new_order_kitchen",
    "order_item_update",
    "bar_order_ready",
    "kitchen_order_ready",
    "payment_recorded",
  ],
  /** Guest calls for staff and their escalation. */
  alerts: [
    "new_alert",
    "alert_escalated",
    "alert_acknowledged",
    "alert_resolved",
  ],
  /** Exit passes issued and scanned at the door. */
  exitPasses: ["exit_pass_used", "pass_scan_result"],
} as const;

export type Invalidation = keyof typeof INVALIDATES;

export interface VenueChannelHandlers {
  /** Reload orders — new tickets, status changes, payments. */
  onOrders?: () => void;
  /** Reload alerts — raised, escalated, acknowledged, resolved. */
  onAlerts?: () => void;
  /** Reload exit passes — issued or scanned. */
  onExitPasses?: () => void;
  /**
   * Behaviour tied to one specific event: a sound, a toast, a buzz banner.
   * Runs *in addition to* the invalidation above, never instead of it, so a
   * screen cannot accidentally trade its data refresh for a notification.
   */
  on?: Record<string, (data: Record<string, unknown>) => void>;
}

const GROUP_OF: Record<string, Invalidation[]> = (() => {
  const map: Record<string, Invalidation[]> = {};
  for (const [group, events] of Object.entries(INVALIDATES)) {
    for (const e of events) (map[e] ??= []).push(group as Invalidation);
  }
  return map;
})();

/** Is this event classified? Used by the dev warning below. */
export function isKnownEvent(event: string): boolean {
  return event in GROUP_OF;
}

/**
 * Subscribe to a venue's live channel.
 *
 * Pass `null` for venueId while auth is still loading.
 */
export function useVenueChannel(
  venueId: string | null | undefined,
  handlers: VenueChannelHandlers,
): WSStatus {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const url = useMemo(
    () => (venueId && token ? `${WS_URL}/ws/${venueId}?token=${token}` : null),
    [venueId, token],
  );

  // Handlers are read through a ref inside useReconnectingWS, so an inline
  // object here does not churn the socket.
  return useReconnectingWS(url, (msg: VenueEvent) => {
    const groups = GROUP_OF[msg.event];

    if (!groups) {
      // An event the server sends and this file has not classified. The test
      // should have caught it; say so loudly rather than dropping it silently,
      // which is exactly how the original bug survived.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[venueChannel] unclassified event "${msg.event}" — add it to INVALIDATES in lib/venueChannel.ts`,
        );
      }
      return;
    }

    for (const group of groups) {
      if (group === "orders") handlers.onOrders?.();
      if (group === "alerts") handlers.onAlerts?.();
      if (group === "exitPasses") handlers.onExitPasses?.();
    }

    handlers.on?.[msg.event]?.(msg.data);
  });
}
