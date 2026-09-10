/**
 * Audible and haptic alerts for floor staff.
 *
 * A toast is useless in a lounge. The phone is in an apron pocket, the room is
 * loud, and the screen is off — so an alert has to make a noise and shake the
 * device or it has not happened.
 *
 * Tones are synthesised rather than loaded from a file: no asset to fetch (so
 * it still works on the offline path), nothing to cache-bust, and the pitch can
 * carry meaning — a new alert and one that has gone unanswered should not sound
 * the same.
 *
 * Browsers refuse to play audio until the user has interacted with the page, so
 * `unlock()` must be called from a real tap. `isUnlocked()` lets the UI ask for
 * that tap up front instead of failing silently mid-shift.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

type Ctor = typeof AudioContext;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: Ctor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Call from a click or tap. Safe to call repeatedly. */
export async function unlock(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    // A silent blip: some browsers only consider the context truly unlocked
    // once something has actually been scheduled on it.
    const osc = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.01);
    unlocked = c.state === "running";
    return unlocked;
  } catch {
    return false;
  }
}

export function isUnlocked(): boolean {
  return unlocked && ctx?.state === "running";
}

interface Beep {
  freq: number;
  start: number;
  duration: number;
  gain?: number;
}

function play(beeps: Beep[]) {
  const c = getCtx();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime;

  for (const b of beeps) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = b.freq;

    const peak = b.gain ?? 0.22;
    const start = t0 + b.start;
    const end = start + b.duration;
    // Ramped rather than switched, because an instant on/off clicks audibly.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

function buzz(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* Unsupported on iOS Safari; the tone still plays. */
    }
  }
}

/** A guest is asking for someone. Two rising notes — a summons, not a warning. */
export function playNewAlert() {
  play([
    { freq: 880, start: 0, duration: 0.14 },
    { freq: 1174, start: 0.17, duration: 0.2 },
  ]);
  buzz([120, 70, 180]);
}

/** Nobody answered. Four insistent notes, louder, so it cuts through the room. */
export function playEscalation() {
  play([
    { freq: 1046, start: 0, duration: 0.12, gain: 0.3 },
    { freq: 1046, start: 0.16, duration: 0.12, gain: 0.3 },
    { freq: 1318, start: 0.32, duration: 0.12, gain: 0.3 },
    { freq: 1318, start: 0.48, duration: 0.26, gain: 0.3 },
  ]);
  buzz([200, 90, 200, 90, 320]);
}

/** An order is ready to run. Softer, and clearly not a guest call. */
export function playReady() {
  play([
    { freq: 660, start: 0, duration: 0.11, gain: 0.16 },
    { freq: 990, start: 0.13, duration: 0.16, gain: 0.16 },
  ]);
  buzz([90]);
}
