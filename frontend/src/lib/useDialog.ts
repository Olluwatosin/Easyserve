/**
 * What a modal owes a keyboard and a screen reader.
 *
 * The dialogs in this app were plain divs: nothing announced them, Escape did
 * not close them, and Tab walked straight out of the dialog into the page
 * behind it — where a screen reader then read out content the user could not
 * see and could not reach. On a phone that is invisible; on a laptop with a
 * keyboard, which is how an owner does their admin, it is the difference
 * between usable and not.
 *
 * Returns props to spread on the dialog element, so each one is three added
 * characters at the call site rather than a rewrite.
 *
 *   const dialog = useDialog(onClose, "Issue a new PIN");
 *   <div {...dialog.props} className="card">…</div>
 */

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useDialog(onClose: () => void, label: string) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Remembered so focus can go back where it came from. Without this, closing a
  // dialog drops the caret at the top of the document and a keyboard user has
  // to tab all the way back to where they were.
  const returnTo = useRef<Element | null>(null);

  const focusables = useCallback((): HTMLElement[] => {
    const root = ref.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }, []);

  useEffect(() => {
    returnTo.current = document.activeElement;

    // Focus the first real control, not the dialog itself — a guest or an owner
    // opening "Receive delivery" should be able to type immediately.
    const first = focusables()[0];
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, which is what keeps Tab inside the dialog.
      if (e.shiftKey && (active === firstItem || !ref.current?.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only restore if the element is still in the document — the dialog may
      // have been opened from a row that has since been removed.
      const back = returnTo.current as HTMLElement | null;
      if (back && document.contains(back)) back.focus?.();
    };
  }, [onClose, focusables]);

  return {
    props: {
      ref,
      role: "dialog" as const,
      "aria-modal": true,
      "aria-label": label,
    },
  };
}
