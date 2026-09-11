"use client";

/**
 * The photograph behind the sign-in screens.
 *
 * This artwork has now been lost three times, each in a different way, so it is
 * worth saying plainly what this component is defending against.
 *
 * It began as a hotlink to Unsplash. The security-hardening pass stripped it —
 * correctly, since an outside host could watch everyone who reaches sign-in,
 * swap the file, or go down and take the page's appearance with it — but nothing
 * replaced it, so the room went too. It came back as drawn SVG, which survives
 * offline and stays sharp at any size, and which reads flat beside a photograph.
 * Then the photograph returned through next/image and the drawn fallback painted
 * *over* it: the image was complete, decoded, opaque, correctly sized and
 * reported on top by elementsFromPoint, and the page still showed the drawing.
 *
 * So this is deliberately the dullest thing that works: a CSS background on a
 * plain div, with the drawn scene behind it. No image component, no load
 * callbacks, no stacking subtleties to get wrong.
 *
 * The fallback needs no logic either. A div whose background image has not
 * arrived is simply transparent, so the drawn room shows through until the
 * photograph paints over it, and keeps showing if the photograph never comes.
 * That behaviour is free, which is the point — the previous version tried to
 * coordinate the two and coordinated them wrong.
 *
 * The photograph ships with the app: no third-party request at runtime, nothing
 * to go down, nobody watching who signs in. One 244KB JPEG, cached after the
 * first load. That is more bytes than a per-viewport WebP would cost, and it is
 * the trade taken deliberately — a background that renders beats a smaller one
 * that argues with its own fallback.
 *
 * Photo: Unsplash (photo-1470337458703-46ad1756a187), Unsplash License —
 * free for commercial use, no attribution required.
 */

import { NightlifeScene } from "@/components/NightlifeScene";

export function HeroArt({
  className = "",
  /**
   * Which part of the frame to hold when the panel is narrower than the photo.
   * The glass sits right of centre and the bar top runs along the bottom, so
   * favouring the right keeps the subject in view while the darker left stays
   * under the type.
   */
  position = "62% 50%",
}: {
  className?: string;
  position?: string;
}) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <NightlifeScene className="absolute inset-0 w-full h-full" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/hero-bar.jpg)",
          backgroundSize: "cover",
          backgroundPosition: position,
          backgroundRepeat: "no-repeat",
          zIndex: 1,
        }}
      />
    </div>
  );
}
