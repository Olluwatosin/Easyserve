/**
 * The queue that holds a guest's order when the signal drops.
 *
 * Venues have dead corners. When a guest taps "place order" in one, the order
 * goes in here and is replayed when the phone reconnects — so the failure this
 * guards against is not an error message, it is a round that silently never
 * arrives, or arrives twice, or arrives out of order.
 *
 * Three properties matter, and all three are easy to break by accident:
 *
 *   * nothing is lost when the network is down;
 *   * nothing is sent twice, which would charge a guest twice;
 *   * order is preserved, because a status update for an order that has not
 *     been created yet fails and would block the queue behind it.
 */

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearQueue, enqueue, flush, listPending, newRequestId } from "./offline";

function queued(n: number) {
  return {
    id: `req-${n}`,
    method: "POST" as const,
    url: `/customer/orders/table-${n}`,
    kind: "order" as const,
    label: `Order ${n}`,
    body: { items: [] },
  };
}

const ok = () => new Response("{}", { status: 200 });
const serverError = () => new Response("nope", { status: 503 });
const rejected = () => new Response("bad", { status: 400 });

beforeEach(async () => {
  await clearQueue();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("holding on to work", () => {
  it("keeps a queued order until it is delivered", async () => {
    await enqueue(queued(1));
    expect(await listPending()).toHaveLength(1);
  });

  it("delivers and then forgets", async () => {
    await enqueue(queued(1));
    const result = await flush(async () => ok());

    expect(result.sent).toBe(1);
    expect(await listPending()).toHaveLength(0);
  });

  it("keeps the order when the server is having a problem", async () => {
    // 5xx means try again later. Dropping it here would lose a guest's round.
    await enqueue(queued(1));
    const result = await flush(async () => serverError());

    expect(result.failed).toBe(1);
    expect(await listPending()).toHaveLength(1);
  });

  it("keeps the order when the phone is still offline", async () => {
    await enqueue(queued(1));
    const result = await flush(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(result.failed).toBe(1);
    expect(await listPending()).toHaveLength(1);
  });
});

describe("not sending anything twice", () => {
  it("sends each queued request once", async () => {
    await enqueue(queued(1));
    await enqueue(queued(2));

    const seen: string[] = [];
    await flush(async (r) => {
      seen.push(r.id);
      return ok();
    });

    expect(seen).toEqual(["req-1", "req-2"]);
    expect(new Set(seen).size).toBe(2);
  });

  it("does not resend what already went through on a later flush", async () => {
    await enqueue(queued(1));
    await flush(async () => ok());

    const seen: string[] = [];
    await flush(async (r) => {
      seen.push(r.id);
      return ok();
    });
    expect(seen).toEqual([]);
  });

  it("mints a different idempotency key each time", async () => {
    // The key the backend recognises a replay by. Two orders sharing one would
    // make the second silently return the first.
    const keys = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(keys.size).toBe(50);
  });
});

describe("keeping the order of things", () => {
  it("replays oldest first", async () => {
    for (const n of [1, 2, 3]) await enqueue(queued(n));

    const seen: string[] = [];
    await flush(async (r) => {
      seen.push(r.id);
      return ok();
    });
    expect(seen).toEqual(["req-1", "req-2", "req-3"]);
  });

  it("stops at the first failure rather than skipping past it", async () => {
    // A status update for an order that has not been created yet would fail.
    // Carrying on past a failure is how the queue gets out of sequence.
    for (const n of [1, 2, 3]) await enqueue(queued(n));

    const seen: string[] = [];
    await flush(async (r) => {
      seen.push(r.id);
      return r.id === "req-2" ? serverError() : ok();
    });

    expect(seen).toEqual(["req-1", "req-2"]);
    const left = await listPending();
    expect(left.map((r) => r.id)).toEqual(["req-2", "req-3"]);
  });

  it("drops a request the server has refused outright", async () => {
    // A 4xx will be judged the same way for ever, and keeping it would block
    // every order behind it permanently.
    for (const n of [1, 2]) await enqueue(queued(n));

    const result = await flush(async (r) =>
      r.id === "req-1" ? rejected() : ok(),
    );

    expect(result.dropped).toBe(1);
    expect(result.sent).toBe(1);
    expect(await listPending()).toHaveLength(0);
  });
});

describe("not flushing when it cannot work", () => {
  it("does nothing while the browser says it is offline", async () => {
    await enqueue(queued(1));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const send = vi.fn(async () => ok());
    const result = await flush(send);

    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(await listPending()).toHaveLength(1);
  });
});
