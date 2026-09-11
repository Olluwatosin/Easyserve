/**
 * What is running on each table, derived from orders.
 *
 * Staff think in tables; the API answers in orders. A table with three separate
 * rounds is three orders and one decision — "do they owe anything, and how long
 * have they been sitting" — so every screen that shows a floor was doing the
 * same regrouping, and any two of them could disagree about what a table owes.
 *
 * That number is the one someone decides to let a table leave on, so it lives
 * in one place. `isUnpaid` is imported rather than re-expressed here for the
 * same reason: this must never drift from what the cashier's queue considers
 * settled.
 */

import { isUnpaid, needsPayment } from "@/lib/orderStatus";

export interface LiveOrderItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
}

export interface LiveOrder {
  id: string;
  table_id: string | null;
  table_label?: string | null;
  status: string;
  grand_total?: number;
  total_amount?: number;
  service_charge?: number;
  vat_amount?: number;
  items: LiveOrderItem[];
  created_at: string;
}

export interface TableLive {
  tableId: string;
  label: string | null;
  /** Unpaid orders only — a settled round is not part of what a table owes. */
  open: LiveOrder[];
  owed: number;
  /** When the earliest still-open order was placed. */
  since: string | null;
  /** Served in full and still owing: the walkout risk. */
  needsPaying: boolean;
}

/** Grand total, however this particular endpoint spelled it. */
function orderTotal(o: LiveOrder): number {
  if (o.grand_total != null) return Number(o.grand_total) || 0;
  return (
    (Number(o.total_amount) || 0) +
    (Number(o.service_charge) || 0) +
    (Number(o.vat_amount) || 0)
  );
}

export function groupOpenByTable(orders: LiveOrder[]): Record<string, TableLive> {
  const map: Record<string, TableLive> = {};
  for (const o of orders) {
    if (!o.table_id || !isUnpaid(o.status)) continue;
    const e = (map[o.table_id] ??= {
      tableId: o.table_id,
      label: o.table_label ?? null,
      open: [],
      owed: 0,
      since: null,
      needsPaying: false,
    });
    e.open.push(o);
    e.owed += orderTotal(o);
    if (!e.since || o.created_at < e.since) e.since = o.created_at;
    if (needsPayment(o.status)) e.needsPaying = true;
    if (!e.label && o.table_label) e.label = o.table_label;
  }
  return map;
}

/**
 * Ordered the way a floor should be walked: tables that are served and still
 * owing first, then whoever has been sitting longest. Both ends of that are
 * about money leaving the building.
 */
export function walkOrder(tables: TableLive[]): TableLive[] {
  return [...tables].sort((a, b) => {
    if (a.needsPaying !== b.needsPaying) return a.needsPaying ? -1 : 1;
    return (a.since ?? "").localeCompare(b.since ?? "");
  });
}

/** How long a table has been running, in the words a floor uses. */
export function runningFor(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
