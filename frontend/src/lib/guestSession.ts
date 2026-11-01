// ── Sessions: one per table, one per visit ───────────────────────────────────
//
// A session token is what ties a guest's phone to a bill. It used to be a
// single value under one key, minted once and never cleared, which was wrong in
// two ways that both showed up as "the order screen keeps growing".
//
// **It was shared across tables.** One phone scanning table 3 and later table 7
// put both tables' rounds on one bill. Not mess — a wrong bill.
//
// **It never ended.** Nothing cleared it, so the visit after the one you paid
// for opened on top of the last one, and the one after that on top of both.
// Eventually a guest sits down to a receipt for a night they have gone home
// from. Keying per table fixes the first; the other two rules below end a visit:
//
// * the venue's business day rolled over (6AM, same boundary as everything
//   else), so anything still open belongs to a night that is over;
// * everything on the session has been paid for, which the menu response
//   reports back as `settled`. That is the real end of a visit, and it is the
//   server's call rather than the phone's — the phone does not know whether
//   somebody settled at the bar.

export const SESSION_PREFIX = "es_session:";

/** Tonight's date at the venue. Before 6AM that is still yesterday. */
export function businessNight(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function mintSession(qr: string): string {
  const token = crypto.randomUUID();
  try {
    localStorage.setItem(
      SESSION_PREFIX + qr,
      JSON.stringify({ token, night: businessNight() }),
    );
  } catch {
    // Private browsing, or storage full. The visit still works — it just will
    // not survive a reload, which is better than refusing to take an order.
  }
  return token;
}

/** The token for this table's current visit, starting a new one if the last
 *  belongs to a night that is over. */
export function openSession(qr: string): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + qr);
    if (raw) {
      const saved = JSON.parse(raw) as { token?: string; night?: string };
      if (saved.token && saved.night === businessNight()) return saved.token;
    }
  } catch {
    /* unreadable or from an older shape — start clean */
  }
  return mintSession(qr);
}
