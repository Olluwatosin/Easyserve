/**
 * Sorting the owner's menu table.
 *
 * Sorting looks trivial and is where quiet wrongness lives. Three cases here
 * each represent a way a menu would mislead the person reading it: prices
 * compared as text, "nobody has entered a stock level" treated as zero, and
 * items taken off sale sitting among the live ones where they read as available.
 */

import { describe, expect, it } from "vitest";

import { nextSort, sortItems, type Sortable } from "./menuSort";

function item(over: Partial<Sortable> & { name: string }): Sortable {
  return {
    item_type: "drink",
    price: 1000,
    order_count: 0,
    stock_quantity: 0,
    is_available: true,
    ...over,
  };
}

const names = (xs: readonly Sortable[]) => xs.map((x) => x.name);

describe("price", () => {
  it("orders by value, not by the look of the number", () => {
    // Compared as text, ₦9,000 sorts above ₦120,000 because "9" > "1".
    const list = [
      item({ name: "Moet", price: 95000 }),
      item({ name: "Star", price: 9000 }),
      item({ name: "Hennessy XO", price: 120000 }),
    ];
    expect(names(sortItems(list, "price", "asc"))).toEqual([
      "Star", "Moet", "Hennessy XO",
    ]);
  });

  it("reverses cleanly", () => {
    const list = [
      item({ name: "Star", price: 9000 }),
      item({ name: "Hennessy XO", price: 120000 }),
    ];
    expect(names(sortItems(list, "price", "desc"))).toEqual([
      "Hennessy XO", "Star",
    ]);
  });
});

describe("stock", () => {
  it("does not treat an untracked item as empty", () => {
    // The point of sorting by stock is to find what is about to run out. An
    // item nobody tracks is not about to run out, and putting it first buries
    // the ones that are.
    const list = [
      item({ name: "Untracked", stock_quantity: null }),
      item({ name: "Nearly out", stock_quantity: 2 }),
      item({ name: "Plenty", stock_quantity: 40 }),
    ];
    expect(names(sortItems(list, "stock", "asc"))).toEqual([
      "Nearly out", "Plenty", "Untracked",
    ]);
  });

  it("keeps untracked items last even when reversed", () => {
    const list = [
      item({ name: "Untracked", stock_quantity: null }),
      item({ name: "Plenty", stock_quantity: 40 }),
    ];
    expect(names(sortItems(list, "stock", "desc"))).toEqual([
      "Plenty", "Untracked",
    ]);
  });

  it("puts a genuine zero where it belongs — first", () => {
    const list = [
      item({ name: "Plenty", stock_quantity: 40 }),
      item({ name: "Out", stock_quantity: 0 }),
    ];
    expect(names(sortItems(list, "stock", "asc"))[0]).toBe("Out");
  });
});

describe("availability", () => {
  it("sends items taken off sale to the end, whatever the column", () => {
    // Scattered through the list they read as available, which is how a
    // bartender ends up promising something that is not being served.
    const list = [
      item({ name: "Off sale but cheap", price: 100, is_available: false }),
      item({ name: "On sale", price: 50000 }),
    ];
    expect(names(sortItems(list, "price", "asc"))).toEqual([
      "On sale", "Off sale but cheap",
    ]);
  });
});

describe("names", () => {
  it("sorts accented names where a reader expects them", () => {
    const list = [
      item({ name: "Zobo" }),
      item({ name: "Sàngó Special" }),
      item({ name: "Amarula" }),
    ];
    expect(names(sortItems(list, "name", "asc"))).toEqual([
      "Amarula", "Sàngó Special", "Zobo",
    ]);
  });

  it("breaks ties by name so equal rows do not shuffle", () => {
    const list = [
      item({ name: "Beta", price: 5000 }),
      item({ name: "Alpha", price: 5000 }),
    ];
    expect(names(sortItems(list, "price", "asc"))).toEqual(["Alpha", "Beta"]);
    // And the same answer on a second pass, rather than whatever the previous
    // sort happened to leave behind.
    expect(names(sortItems(list, "price", "asc"))).toEqual(["Alpha", "Beta"]);
  });
});

describe("type", () => {
  it("puts drinks before food, which alphabetical would not", () => {
    const list = [
      item({ name: "Jollof", item_type: "food" }),
      item({ name: "Shisha", item_type: "other" }),
      item({ name: "Star", item_type: "drink" }),
    ];
    expect(names(sortItems(list, "type", "asc"))).toEqual([
      "Star", "Jollof", "Shisha",
    ]);
  });
});

describe("not mutating the caller's array", () => {
  it("returns a copy", () => {
    // The caller holds React state. Sorting in place means a list that changes
    // without re-rendering.
    const list = [item({ name: "B" }), item({ name: "A" })];
    const before = names(list);
    sortItems(list, "name", "asc");
    expect(names(list)).toEqual(before);
  });

  it("returns a copy even with no column selected", () => {
    const list = [item({ name: "B" })];
    expect(sortItems(list, null, "asc")).not.toBe(list);
  });
});

describe("clicking a heading", () => {
  const none = { key: null, direction: "asc" } as const;

  it("opens text ascending and numbers descending", () => {
    // "What sells most" and "what costs most" are the questions actually being
    // asked of a number column.
    expect(nextSort(none, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort(none, "price")).toEqual({ key: "price", direction: "desc" });
    expect(nextSort(none, "sold")).toEqual({ key: "sold", direction: "desc" });
  });

  it("opens stock ascending, because the question is what is running out", () => {
    expect(nextSort(none, "stock")).toEqual({ key: "stock", direction: "asc" });
  });

  it("reverses on a second click", () => {
    const first = nextSort(none, "price");
    expect(nextSort(first, "price")).toEqual({ key: "price", direction: "asc" });
  });

  it("clears on a third, so there is a way back to the menu's own order", () => {
    const first = nextSort(none, "price");
    const second = nextSort(first, "price");
    expect(nextSort(second, "price")).toEqual({ key: null, direction: "asc" });
  });

  it("switching column starts that column fresh", () => {
    const onPrice = nextSort(none, "price");
    expect(nextSort(onPrice, "name")).toEqual({ key: "name", direction: "asc" });
  });
});
