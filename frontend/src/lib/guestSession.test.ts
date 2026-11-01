/**
 * The rules that decide whose bill a guest is looking at.
 *
 * This logic produced the complaint that started it: "when I scan the customer
 * barcode it keeps adding up to previous". A token stored under one global key,
 * minted once, never cleared — so one phone put two tables on one bill, and the
 * scan after a night you had paid for reopened the bill you had settled.
 *
 * It lived inside a 1,281-line page component where none of it could be tested.
 * These are the four rules, each one a bug that reached a real guest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_PREFIX, businessNight, mintSession, openSession } from "./guestSession";

const TABLE_A = "qr-table-a";
const TABLE_B = "qr-table-b";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a token per table", () => {
  it("gives two tables two different bills", () => {
    // The original bug: one phone scanning table 3 then table 7 merged both
    // tables onto one bill. Not untidiness — a wrong bill.
    const a = openSession(TABLE_A);
    const b = openSession(TABLE_B);
    expect(a).not.toBe(b);
    expect(a).toBeTruthy();
  });

  it("returns the same token when the same table is scanned again", () => {
    // A guest who locks their phone and rescans is still on the same visit.
    const first = openSession(TABLE_A);
    expect(openSession(TABLE_A)).toBe(first);
  });

  it("keeps each table's token under its own key", () => {
    openSession(TABLE_A);
    openSession(TABLE_B);
    expect(localStorage.getItem(SESSION_PREFIX + TABLE_A)).toBeTruthy();
    expect(localStorage.getItem(SESSION_PREFIX + TABLE_B)).toBeTruthy();
  });
});

describe("the night boundary", () => {
  it("treats 2am as still last night", () => {
    // A lounge's Friday includes Saturday's small hours. Rolling the session at
    // midnight would hand a drinking guest a clean screen mid-visit.
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-03-13T23:30:00"));
    const beforeMidnight = openSession(TABLE_A);

    vi.setSystemTime(new Date("2026-03-14T02:00:00"));
    expect(openSession(TABLE_A)).toBe(beforeMidnight);
  });

  it("starts a new visit once the day has rolled at 6am", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-03-14T02:00:00"));
    const lastNight = openSession(TABLE_A);

    vi.setSystemTime(new Date("2026-03-14T21:00:00"));
    const tonight = openSession(TABLE_A);

    expect(tonight).not.toBe(lastNight);
  });

  it("names the night the same way either side of midnight", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-03-13T23:00:00"));
    const late = businessNight();
    vi.setSystemTime(new Date("2026-03-14T03:00:00"));
    const small = businessNight();

    expect(small).toBe(late);
  });

  it("names a new night after 6am", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-03-14T05:59:00"));
    const before = businessNight();
    vi.setSystemTime(new Date("2026-03-14T06:01:00"));
    const after = businessNight();

    expect(after).not.toBe(before);
  });
});

describe("minting a fresh visit", () => {
  it("replaces the stored token", () => {
    // Called when the server reports the last visit was paid off. Starting the
    // new token here rather than on payment is what makes it work when the
    // guest paid at the bar, or on somebody else's phone.
    const paid = openSession(TABLE_A);
    const fresh = mintSession(TABLE_A);

    expect(fresh).not.toBe(paid);
    expect(openSession(TABLE_A)).toBe(fresh);
  });

  it("does not disturb another table", () => {
    const other = openSession(TABLE_B);
    openSession(TABLE_A);
    mintSession(TABLE_A);
    expect(openSession(TABLE_B)).toBe(other);
  });
});

describe("when storage will not cooperate", () => {
  it("still produces a usable token in private browsing", () => {
    // Safari throws on setItem in some private modes. Refusing to take an order
    // because a token cannot be remembered would be far worse than a visit that
    // does not survive a reload.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(openSession(TABLE_A)).toBeTruthy();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("recovers from a stored value in the old shape", () => {
    // Phones that scanned before the per-table change still hold the old flat
    // string. Reading it must not throw; it should simply start a visit.
    localStorage.setItem(SESSION_PREFIX + TABLE_A, "a-bare-token-not-json");
    expect(openSession(TABLE_A)).toBeTruthy();
  });

  it("recovers from a stored value missing its night", () => {
    localStorage.setItem(SESSION_PREFIX + TABLE_A, JSON.stringify({ token: "x" }));
    const got = openSession(TABLE_A);
    expect(got).toBeTruthy();
    expect(got).not.toBe("x");
  });
});
