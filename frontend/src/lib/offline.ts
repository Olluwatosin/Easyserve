/**
 * An outbox for writes made while the network is unavailable.
 *
 * Venue WiFi drops. Generators cut over. A phone walks behind the cold room and
 * loses signal for thirty seconds. None of that should stop a guest ordering or
 * a bartender marking a drink ready — and none of it should quietly lose the
 * request either.
 *
 * Requests are held in IndexedDB, not memory or localStorage: it survives a tab
 * crash and a phone locking, and it does not block the main thread the way a
 * synchronous store does.
 *
 * Two rules make the replay safe:
 *
 *   1. Every queued request carries a stable id generated when it was queued,
 *      so the server recognises a replay instead of creating a duplicate. That
 *      matters most for orders, where a duplicate is money.
 *   2. A request is removed from the outbox only after the server has actually
 *      accepted it. A failed flush leaves it queued to try again.
 *
 * A 4xx is treated as final, because retrying a request the server has already
 * rejected on its merits will fail identically forever and block everything
 * behind it. Only network errors and 5xx are retried.
 */

const DB_NAME = "easyserve-outbox";
const DB_VERSION = 1;
const STORE = "requests";

export interface QueuedRequest {
  id: string;
  method: "POST" | "PATCH";
  url: string;
  body: unknown;
  /** What this represents, for the UI to describe it to a human. */
  kind: "order" | "status" | "alert";
  label: string;
  queuedAt: number;
  attempts: number;
}

type Listener = (pending: QueuedRequest[]) => void;

const listeners = new Set<Listener>();
let flushing = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function newRequestId(): string {
  // randomUUID needs a secure context; every deployment is HTTPS, but a plain
  // http:// dev host would otherwise throw here.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function listPending(): Promise<QueuedRequest[]> {
  try {
    const all = await tx<QueuedRequest[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedRequest[]>);
    return all.sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  }
}

async function notify() {
  const pending = await listPending();
  listeners.forEach((fn) => fn(pending));
}

export function onPendingChange(fn: Listener): () => void {
  listeners.add(fn);
  listPending().then(fn);
  return () => listeners.delete(fn);
}

export async function enqueue(req: Omit<QueuedRequest, "queuedAt" | "attempts">): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...req, queuedAt: Date.now(), attempts: 0 }));
  await notify();
}

async function remove(id: string) {
  await tx("readwrite", (s) => s.delete(id));
}

async function bumpAttempts(item: QueuedRequest) {
  await tx("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1 }));
}

/**
 * Replay everything queued, oldest first.
 *
 * Order matters: a status update for an order that has not been created yet
 * would fail, so the queue is drained strictly in sequence and stops at the
 * first request that could not be delivered.
 */
export async function flush(
  send: (r: QueuedRequest) => Promise<Response>,
): Promise<{ sent: number; failed: number; dropped: number }> {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, dropped: 0 };
  }
  flushing = true;
  let sent = 0;
  let failed = 0;
  let dropped = 0;

  try {
    for (const item of await listPending()) {
      try {
        const res = await send(item);
        if (res.ok) {
          await remove(item.id);
          sent++;
        } else if (res.status >= 400 && res.status < 500) {
          // The server has judged this request and will judge it the same way
          // forever. Keeping it would block everything behind it.
          await remove(item.id);
          dropped++;
        } else {
          await bumpAttempts(item);
          failed++;
          break;
        }
      } catch {
        await bumpAttempts(item);
        failed++;
        break; // offline again — stop, keep order intact
      }
    }
  } finally {
    flushing = false;
    await notify();
  }
  return { sent, failed, dropped };
}

export async function clearQueue(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
  await notify();
}
