"use client";

/**
 * A table is calling this attendant, said loudly enough to survive a phone.
 *
 * The sound cannot be relied on. iOS will not play audio until the page has
 * had a real tap, silences it again whenever the phone is locked or the tab
 * goes to the background, and honours the hardware mute switch regardless — so
 * on the device most of the floor is carrying, an alert can arrive in complete
 * silence with nothing to indicate it did. `navigator.vibrate` is not a
 * fallback either: iOS Safari does not implement it at all.
 *
 * That leaves the screen. An attendant glancing at a phone in their hand has to
 * be able to tell, from across a dark room and without reading, that a table
 * wants them — so this takes the whole screen, holds one colour, and does not
 * go away on a timer. A toast in the corner is exactly what got missed.
 *
 * Dismissing is deliberately two-sided: "On my way" acknowledges the alert, so
 * the guest's phone stops waiting and says somebody is coming. "Not me" closes
 * the screen without claiming it, which is what an attendant does when the
 * alert reached the wrong person — and leaves it pending for the escalation to
 * pick up rather than silently absorbing it.
 */

import { useEffect } from "react";
import { Bell, HandCoins, Plus, X } from "lucide-react";

export interface SummonsData {
  alertId: string;
  type: string;
  tableLabel: string;
  zone: string | null;
  /** Nobody answered in time, so this is now everyone's problem. */
  escalated: boolean;
  waitingSeconds?: number;
}

const WANTS: Record<string, { words: string; icon: typeof Bell }> = {
  call_attendant: { words: "is calling you", icon: Bell },
  request_payment: { words: "wants the bill", icon: HandCoins },
  order_more: { words: "wants to order more", icon: Plus },
};

export function Summons({
  data,
  onAccept,
  onDismiss,
}: {
  data: SummonsData;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  // Android and most desktop browsers buzz; iOS ignores this entirely, which is
  // the reason the visual above does the real work. Repeated while the screen
  // is up, because one buzz in a pocket during a loud set is one missed buzz.
  useEffect(() => {
    const buzz = () => {
      try {
        navigator.vibrate?.(data.escalated ? [500, 150, 500, 150, 500] : [400, 180, 400]);
      } catch {
        /* unsupported, or blocked without a gesture */
      }
    };
    buzz();
    const every = setInterval(buzz, 3000);
    return () => {
      clearInterval(every);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* nothing to stop */
      }
    };
  }, [data.escalated, data.alertId]);

  const want = WANTS[data.type] ?? WANTS.call_attendant;
  const Icon = want.icon;
  const accent = data.escalated ? "#FF9500" : "#00D4B4";
  const ink = "#080D14";

  return (
    <div
      className="summons fixed inset-0 z-[100] flex flex-col items-center justify-center px-8 text-center"
      style={{ background: accent }}
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${data.tableLabel} ${want.words}`}
    >
      <div className="summons-pulse flex flex-col items-center gap-5">
        <Icon size={56} color={ink} strokeWidth={2.2} />

        {data.escalated && (
          <span
            className="text-xs font-bold uppercase tracking-[0.25em] px-3 py-1 rounded-full"
            style={{ background: "rgba(8,20,32,0.16)", color: ink }}
          >
            Nobody answered
          </span>
        )}

        <div>
          <p
            className="font-display font-bold leading-none"
            style={{ fontSize: "clamp(44px, 16vw, 92px)", color: ink }}
          >
            {data.tableLabel}
          </p>
          {data.zone && (
            <p
              className="text-sm font-semibold uppercase tracking-[0.18em] mt-2"
              style={{ color: ink, opacity: 0.6 }}
            >
              {data.zone}
            </p>
          )}
        </div>

        <p
          className="font-display font-bold"
          style={{ fontSize: 22, color: ink, opacity: 0.85 }}
        >
          {want.words}
          {data.escalated && data.waitingSeconds
            ? ` · waiting ${data.waitingSeconds}s`
            : ""}
        </p>
      </div>

      {/* Sat low and made large: this gets hit one-handed, in the dark, while
          carrying something. */}
      <div className="absolute inset-x-8 bottom-10 flex flex-col items-center gap-3">
        <button
          onClick={onAccept}
          className="w-full max-w-sm font-display font-bold rounded-2xl"
          style={{
            background: ink,
            color: accent,
            fontSize: 20,
            padding: "20px 0",
          }}
        >
          On my way
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2"
          style={{ color: ink, opacity: 0.6 }}
        >
          <X size={14} />
          Not me
        </button>
      </div>

      <style>{`
        @keyframes summons-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.04); opacity: 0.92; }
        }
        .summons-pulse { animation: summons-breathe 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .summons-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
