/**
 * How order state is described to people working a floor.
 *
 * The stored values are internal — `fully_served` is accurate and tells an
 * attendant nothing about what to do next. What she needs to see is which
 * tables owe money, so that state is labelled by its consequence rather than
 * by its cause.
 */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  open: "Ordered",
  partially_served: "Part served",
  fully_served: "Needs paying",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_COLOR: Record<string, string> = {
  open: "#00D4B4",
  partially_served: "#FF9500",
  // Amber, not teal: served-and-unpaid is the one that needs someone to act.
  // Showing it in the same colour as "all good" is how a table walks out.
  fully_served: "#FFB347",
  paid: "#58C97A",
  cancelled: "#6B7A99",
};

export const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Sent to bar/kitchen",
  preparing: "Being prepared",
  ready: "Ready to serve",
  delivered: "Served",
  cancelled: "Cancelled",
};

/** Served in full and still owing — the attendant's and cashier's queue. */
export function needsPayment(status: string): boolean {
  return status === "fully_served";
}

export function isUnpaid(status: string): boolean {
  return status !== "paid" && status !== "cancelled";
}
