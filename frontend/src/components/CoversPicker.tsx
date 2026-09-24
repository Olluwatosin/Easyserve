"use client";

/**
 * How many people are on this bill.
 *
 * Spend per head is the number a venue runs on. It is the difference between "we
 * took less tonight" and "fewer people came" — two sentences that call for
 * opposite responses, and which a sales total cannot tell apart. It also decides
 * whether a table on a minimum spend actually met it per person.
 *
 * None of that can be derived, so somebody has to say, and the only person who
 * knows is whoever is standing at the table. Which makes speed the whole design
 * problem: this sits on the order card as a row of numbers, one tap, no dialog
 * and no keyboard. An attendant carrying a tray will not open a form.
 *
 * Unset is a real state, kept distinct from any number. Nobody having said is
 * not a table of nobody, and the reports have to skip the first rather than
 * divide by the second — so tapping the current number clears it again, which is
 * also how a mis-tap gets undone.
 */

import { useState } from "react";
import { Users } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

/** Six chips covers almost every table in a lounge; the rest type it. */
const QUICK = [1, 2, 3, 4, 5, 6];

export function CoversPicker({
  orderId,
  covers,
  onChange,
}: {
  orderId: string;
  covers: number | null;
  onChange: (covers: number | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);

  async function set(next: number | null) {
    if (busy) return;
    setBusy(true);
    // Moved straight away: the attendant is walking away from the table, and a
    // chip that waits for a round trip before it looks pressed gets pressed
    // twice.
    const previous = covers;
    onChange(next);
    try {
      await api.patch(`/orders/${orderId}/covers`, { covers: next });
    } catch {
      onChange(previous);
      toast.error("Could not save the headcount");
    } finally {
      setBusy(false);
      setTyping(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Users size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Guests
      </span>

      {QUICK.map((n) => {
        const on = covers === n;
        return (
          <button
            key={n}
            // Tapping the number already set clears it, back to "nobody has
            // said" — which is what a mis-tap needs and a long-press would hide.
            onClick={() => set(on ? null : n)}
            disabled={busy}
            aria-pressed={on}
            className="rounded-lg text-xs font-bold tabular-nums transition-colors"
            style={{
              width: 30,
              height: 30,
              color: on ? "#080D14" : "var(--muted)",
              background: on ? "var(--teal)" : "transparent",
              border: `1px solid ${on ? "var(--teal)" : "#1E2D42"}`,
            }}
          >
            {n}
          </button>
        );
      })}

      {typing ? (
        <input
          type="number"
          min={1}
          max={200}
          autoFocus
          defaultValue={covers ?? ""}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (!e.target.value) return set(null);
            if (n >= 1 && n <= 200) return set(n);
            setTyping(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setTyping(false);
          }}
          className="rounded-lg text-xs font-bold text-center tabular-nums"
          style={{
            width: 46,
            height: 30,
            color: "var(--text)",
            background: "transparent",
            border: "1px solid var(--teal)",
          }}
        />
      ) : (
        <button
          onClick={() => setTyping(true)}
          disabled={busy}
          className="rounded-lg text-xs font-bold tabular-nums"
          style={{
            height: 30,
            padding: "0 9px",
            color: covers && covers > 6 ? "#080D14" : "var(--muted)",
            background: covers && covers > 6 ? "var(--teal)" : "transparent",
            border: `1px solid ${covers && covers > 6 ? "var(--teal)" : "#1E2D42"}`,
          }}
        >
          {covers && covers > 6 ? covers : "7+"}
        </button>
      )}
    </div>
  );
}
