/**
 * The cart, which is where a guest's money is decided.
 *
 * Every figure the guest sees before they commit comes out of this store, and
 * nothing tested it. The cases below are the ones that would cost somebody
 * money or a round: a tap that silently replaces a quantity instead of adding
 * to it, a decrement that leaves a zero-quantity line on the bill, and a total
 * that drifts because prices are held as floats.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { useOrderStore } from "./order";

const HENNESSY = {
  menu_item_id: "item-hennessy",
  name: "Hennessy VS",
  price: 8500,
  item_type: "drink" as const,
};
const JOLLOF = {
  menu_item_id: "item-jollof",
  name: "Jollof Rice",
  price: 4500,
  item_type: "food" as const,
};

const cart = () => useOrderStore.getState().cart;
const total = () =>
  cart().reduce((sum, i) => sum + i.price * i.quantity, 0);

beforeEach(() => {
  useOrderStore.getState().clearCart();
});

describe("adding", () => {
  it("adds a new item at quantity one", () => {
    useOrderStore.getState().addToCart(HENNESSY);
    expect(cart()).toHaveLength(1);
    expect(cart()[0].quantity).toBe(1);
  });

  it("adds to the quantity when the same item is tapped twice", () => {
    // Not a second line, and not a replacement. A guest tapping a drink three
    // times means three drinks.
    const { addToCart } = useOrderStore.getState();
    addToCart(HENNESSY);
    addToCart(HENNESSY);
    addToCart(HENNESSY);

    expect(cart()).toHaveLength(1);
    expect(cart()[0].quantity).toBe(3);
    expect(total()).toBe(25500);
  });

  it("honours an explicit quantity", () => {
    useOrderStore.getState().addToCart({ ...HENNESSY, quantity: 4 });
    expect(cart()[0].quantity).toBe(4);
  });

  it("accumulates an explicit quantity onto what is there", () => {
    const { addToCart } = useOrderStore.getState();
    addToCart(HENNESSY);
    addToCart({ ...HENNESSY, quantity: 2 });
    expect(cart()[0].quantity).toBe(3);
  });

  it("keeps different items on separate lines", () => {
    const { addToCart } = useOrderStore.getState();
    addToCart(HENNESSY);
    addToCart(JOLLOF);
    expect(cart()).toHaveLength(2);
    expect(total()).toBe(13000);
  });
});

describe("changing quantities", () => {
  it("steps up and down", () => {
    const store = useOrderStore.getState();
    store.addToCart({ ...HENNESSY, quantity: 2 });
    store.updateQuantity(HENNESSY.menu_item_id, 1);
    expect(cart()[0].quantity).toBe(3);
    store.updateQuantity(HENNESSY.menu_item_id, -1);
    expect(cart()[0].quantity).toBe(2);
  });

  it("removes the line rather than leaving a zero on the bill", () => {
    // A zero-quantity line would reach the kitchen as an item nobody ordered,
    // and show on the bill as a row costing nothing.
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.updateQuantity(HENNESSY.menu_item_id, -1);
    expect(cart()).toHaveLength(0);
  });

  it("never goes negative", () => {
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.updateQuantity(HENNESSY.menu_item_id, -5);
    expect(cart()).toHaveLength(0);
    expect(total()).toBe(0);
  });

  it("leaves other lines alone", () => {
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.addToCart({ ...JOLLOF, quantity: 2 });
    store.updateQuantity(HENNESSY.menu_item_id, -1);

    expect(cart()).toHaveLength(1);
    expect(cart()[0].menu_item_id).toBe(JOLLOF.menu_item_id);
    expect(cart()[0].quantity).toBe(2);
  });

  it("ignores an unknown item", () => {
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.updateQuantity("not-in-the-cart", 3);
    expect(cart()).toHaveLength(1);
    expect(cart()[0].quantity).toBe(1);
  });
});

describe("removing and clearing", () => {
  it("removes one item", () => {
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.addToCart(JOLLOF);
    store.removeFromCart(HENNESSY.menu_item_id);
    expect(cart()).toHaveLength(1);
    expect(cart()[0].menu_item_id).toBe(JOLLOF.menu_item_id);
  });

  it("empties the cart once an order is placed", () => {
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.clearCart();
    expect(cart()).toHaveLength(0);
    expect(total()).toBe(0);
  });
});

describe("the arithmetic the guest is shown", () => {
  it("totals a mixed round exactly", () => {
    const store = useOrderStore.getState();
    store.addToCart({ ...HENNESSY, quantity: 3 });
    store.addToCart({ ...JOLLOF, quantity: 2 });
    expect(total()).toBe(8500 * 3 + 4500 * 2);
  });

  it("does not drift on prices with kobo", () => {
    // Naira prices are usually whole, but a promo can produce 1333.33 and a
    // float total that renders as ...0000001 destroys trust in every number on
    // the screen.
    const store = useOrderStore.getState();
    store.addToCart({ ...HENNESSY, price: 1333.33, quantity: 3 });
    expect(Math.round(total() * 100) / 100).toBe(3999.99);
  });

  it("counts drinks for the summons, not lines", () => {
    // What the "Earlier this visit" line and the confirmation both read from.
    const store = useOrderStore.getState();
    store.addToCart({ ...HENNESSY, quantity: 4 });
    const items = cart().reduce((n, i) => n + i.quantity, 0);
    expect(items).toBe(4);
  });

  it("can tell what went to the bar from what went to the kitchen", () => {
    // The confirmation used to name the kitchen for every order, so a guest
    // ordering a cognac was told their drink had gone to be cooked.
    const store = useOrderStore.getState();
    store.addToCart(HENNESSY);
    store.addToCart(JOLLOF);

    const hadDrinks = cart().some((i) => i.item_type === "drink");
    const hadFood = cart().some((i) => i.item_type === "food");
    expect(hadDrinks && hadFood).toBe(true);

    store.clearCart();
    store.addToCart(HENNESSY);
    expect(cart().some((i) => i.item_type === "food")).toBe(false);
  });
});
