/**
 * Ordering the owner's menu table.
 *
 * A view, not a running order: this changes what the owner sees while they
 * work and never what a guest's menu shows. That distinction is the whole
 * reason the decorative drag handle came out of the table at the same time —
 * a grip that implies "this sets the order" sitting next to a column sort that
 * does not is worse than either on its own.
 *
 * Kept out of the page component so the comparison is testable. Sorting looks
 * trivial and is where the quiet wrongness lives: naira prices compared as
 * strings put ₦9,000 above ₦120,000, and "not known" sorting as zero puts every
 * item whose cost nobody has entered at the top of the cheapest list.
 */

export type SortKey = "name" | "type" | "price" | "sold" | "stock";
export type SortDirection = "asc" | "desc";

export interface Sortable {
  name: string;
  item_type: "drink" | "food" | "other";
  price: number;
  order_count: number;
  stock_quantity?: number | null;
  is_available: boolean;
}

/** Which way a column points the first time it is clicked.
 *
 *  Text reads naturally A→Z. Numbers are asked about because something is high
 *  or low — "what sells most", "what costs most" — so they open descending,
 *  except stock, where the question is almost always "what is about to run
 *  out". */
export const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  name: "asc",
  type: "asc",
  price: "desc",
  sold: "desc",
  stock: "asc",
};

export const COLUMN_LABEL: Record<SortKey, string> = {
  name: "Item",
  type: "Type",
  price: "Price",
  sold: "Sold",
  stock: "Stock",
};

function compare(a: Sortable, b: Sortable, key: SortKey): number {
  switch (key) {
    case "name":
      // localeCompare so accented names sort where a reader expects — a venue
      // with "Sàngó Special" on the menu should not find it after "Z".
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    case "type":
      // Drinks first, then food, then everything else. Alphabetical would put
      // food above drink, which is the wrong way round for a bar.
      return typeRank(a.item_type) - typeRank(b.item_type);

    case "price":
      return a.price - b.price;

    case "sold":
      return a.order_count - b.order_count;

    case "stock":
      // Only ever called with two tracked values — "untracked goes last" is
      // handled as a rank in sortItems, because it must not be reversed when
      // the column is. See the note there.
      return (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0);
  }
}

function typeRank(t: Sortable["item_type"]): number {
  return t === "drink" ? 0 : t === "food" ? 1 : 2;
}

/**
 * A sorted copy. Never sorts in place — the caller holds React state, and
 * mutating it means a list that changes without re-rendering.
 */
export function sortItems<T extends Sortable>(
  items: readonly T[],
  key: SortKey | null,
  direction: SortDirection,
): T[] {
  if (key === null) return [...items];

  // Two rules outrank the chosen column and, crucially, are **not** reversed
  // when it is. Getting that wrong is subtle: an earlier version negated the
  // whole comparison for a descending sort, which flipped "untracked last" into
  // "untracked first" and put every item nobody tracks at the top of the list
  // of things about to run out. Its own test caught it.
  //
  //   1. Items taken off sale go last. They are not what an owner is scanning
  //      for, and scattered through the list they read as available — which is
  //      how a bartender ends up promising something that is not being served.
  //   2. On the stock column, items with no stock tracking go after the tracked
  //      ones. "Nobody has entered a number" is not "none left".
  const rank = (i: T): number => {
    let r = 0;
    if (!i.is_available) r += 2;
    if (key === "stock" && i.stock_quantity == null) r += 1;
    return r;
  };

  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;

    const result = compare(a, b, key);
    if (result !== 0) return direction === "asc" ? result : -result;

    // Name breaks every remaining tie, so two items at the same price keep a
    // stable order rather than whatever the previous sort left behind.
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** What a click on a column heading should do next. */
export function nextSort(
  current: { key: SortKey | null; direction: SortDirection },
  clicked: SortKey,
): { key: SortKey | null; direction: SortDirection } {
  if (current.key !== clicked) {
    return { key: clicked, direction: FIRST_DIRECTION[clicked] };
  }
  // Second click reverses. A third clears it, so there is always a way back to
  // the menu's own order without reloading the page.
  if (current.direction === FIRST_DIRECTION[clicked]) {
    return {
      key: clicked,
      direction: FIRST_DIRECTION[clicked] === "asc" ? "desc" : "asc",
    };
  }
  return { key: null, direction: "asc" };
}
