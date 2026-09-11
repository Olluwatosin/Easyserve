"use client";

/**
 * The photograph behind the sign-in screens.
 *
 * This artwork has now been lost twice, in opposite ways, and this component
 * exists so it cannot happen a third time.
 *
 * It began as a hotlink to Unsplash. The security-hardening pass stripped it —
 * correctly, since an outside host could watch every visitor, swap the file, or
 * simply go down and take the page's appearance with it — but nothing replaced
 * it, so the room went too. Then it was replaced with drawn SVG, which survives
 * offline and stays sharp at any size, but reads as flat next to a photograph:
 * no glare on the glass, no depth in the ice.
 *
 * So the photograph is back, and it now *ships with the app*: no third-party
 * request at runtime, nothing to go down, no one watching who signs in. Next's
 * image pipeline serves AVIF/WebP at the size the viewport actually needs,
 * which matters more here than anywhere else in the product — this is the first
 * screen anyone loads, often on mobile data.
 *
 * The drawn scene stays underneath as the fallback. If the photo is slow, fails
 * or is blocked, the room is still there rather than the bare gradient that
 * started all this.
 *
 * Photo: Unsplash (photo-1470337458703-46ad1756a187), Unsplash License —
 * free for commercial use, no attribution required.
 */

import { useState } from "react";

import Image from "next/image";

import { NightlifeScene } from "@/components/NightlifeScene";

export function HeroArt({
  className = "",
  /**
   * Which part of the frame to hold when the panel is narrower than the photo.
   * The glass sits right of centre and the bar top runs along the bottom, so
   * favouring the right keeps the subject in view while the darker left stays
   * under the tagline.
   */
  position = "68% 55%",
  /** Tells the browser how wide this will render, so it fetches no more. */
  sizes = "(min-width: 1024px) 56vw, 100vw",
  priority = false,
}: {
  className?: string;
  position?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className={`overflow-hidden ${className}`}>
      {/* The fallback is painted until the photograph is actually up, then it
          gets out of the way.

          Leaving both mounted looked correct — the photo is the later sibling,
          so it should paint on top — and it did not: the drawn scene covered a
          fully loaded photograph, and every check said the image was fine
          (complete, decoded, opaque, correct rect, on top by elementsFromPoint).
          It only showed when the SVG was removed. So the fallback now unmounts
          on load rather than relying on paint order, and the photo carries an
          explicit z-index as well. Two reasons it cannot happen again, because
          the first one was already supposed to be sufficient. */}
      {!shown && <NightlifeScene className="absolute inset-0 w-full h-full" />}
      <Image
        src="/hero-bar.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        quality={82}
        sizes={sizes}
        className="object-cover"
        style={{ objectPosition: position, zIndex: 1 }}
        onLoad={() => setShown(true)}
        // If it fails, the drawn room stays exactly where it is.
        onError={() => setShown(false)}
      />
    </div>
  );
}
