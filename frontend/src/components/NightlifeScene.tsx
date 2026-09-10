/**
 * The login hero artwork.
 *
 * This slot used to hotlink a photograph from Unsplash. That was removed during
 * security hardening for good reasons — an outside service could see every
 * visitor, swap the file, or go down and take the page's appearance with it —
 * and the replacement was a bare gradient, which lost the room.
 *
 * So: drawn, not fetched. Inline SVG ships with the page, costs one request that
 * already happened, stays sharp at any size, needs no CDN allowance and no
 * cache-busting, and works on the offline path. It is also themed to the brand
 * rather than to whatever a stock library happened to have.
 *
 * Purely decorative, so it is hidden from assistive technology.
 */
export function NightlifeScene({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 480 640"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The room: deep teal falling away to near-black */}
        <linearGradient id="ns-room" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#0F2A33" />
          <stop offset="45%" stopColor="#0A1620" />
          <stop offset="100%" stopColor="#06090F" />
        </linearGradient>

        {/* Backbar wash behind the bottles */}
        <radialGradient id="ns-backbar" cx="0.5" cy="0.32" r="0.62">
          <stop offset="0%" stopColor="#00D4B4" stopOpacity="0.30" />
          <stop offset="55%" stopColor="#00A88F" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#00A88F" stopOpacity="0" />
        </radialGradient>

        {/* Warm lamp low and right */}
        <radialGradient id="ns-lamp" cx="0.82" cy="0.78" r="0.5">
          <stop offset="0%" stopColor="#FF9500" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#FF9500" stopOpacity="0" />
        </radialGradient>

        {/* Liquid in the coupe */}
        <linearGradient id="ns-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F5D4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#00A88F" stopOpacity="0.6" />
        </linearGradient>

        <linearGradient id="ns-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BFF7EC" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#00D4B4" stopOpacity="0.35" />
        </linearGradient>

        {/* Amber spirit, for the bottle at the right */}
        <linearGradient id="ns-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB347" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#C2410C" stopOpacity="0.45" />
        </linearGradient>

        <filter id="ns-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <filter id="ns-bokeh" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <rect width="480" height="640" fill="url(#ns-room)" />
      <rect width="480" height="640" fill="url(#ns-backbar)" />
      <rect width="480" height="640" fill="url(#ns-lamp)" />

      {/* ── Bokeh: out-of-focus lights across the back of the room ── */}
      <g filter="url(#ns-bokeh)" opacity="0.55">
        <circle cx="82" cy="104" r="20" fill="#00D4B4" opacity="0.30" />
        <circle cx="150" cy="62" r="11" fill="#7DE8D6" opacity="0.26" />
        <circle cx="392" cy="128" r="26" fill="#FF9500" opacity="0.16" />
        <circle cx="316" cy="70" r="13" fill="#00D4B4" opacity="0.22" />
        <circle cx="438" cy="228" r="16" fill="#786EFF" opacity="0.16" />
        <circle cx="44" cy="236" r="13" fill="#00D4B4" opacity="0.16" />
        <circle cx="248" cy="42" r="9" fill="#FFB347" opacity="0.20" />
      </g>

      {/* ── The bar top ── */}
      <rect x="0" y="470" width="480" height="170" fill="#080D14" opacity="0.72" />
      <rect x="0" y="468" width="480" height="2.5" fill="#00D4B4" opacity="0.30" />

      {/* ── Backbar bottles, staggered so the shelf reads as depth ── */}
      <g opacity="0.5">
        {[
          { x: 44, h: 132, w: 30, fill: "#0E3A38" },
          { x: 88, h: 168, w: 26, fill: "#12494A" },
          { x: 126, h: 120, w: 32, fill: "#0B3230" },
          { x: 342, h: 150, w: 28, fill: "#123F3C" },
          { x: 382, h: 116, w: 34, fill: "#0E3634" },
          { x: 428, h: 158, w: 26, fill: "#12494A" },
        ].map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={470 - b.h}
              width={b.w}
              height={b.h}
              rx={b.w * 0.32}
              fill={b.fill}
              stroke="#00D4B4"
              strokeOpacity="0.22"
            />
            {/* neck */}
            <rect
              x={b.x + b.w / 2 - 4}
              y={470 - b.h - 26}
              width="8"
              height="28"
              rx="3"
              fill={b.fill}
              stroke="#00D4B4"
              strokeOpacity="0.18"
            />
            {/* a highlight down one side, so glass reads as glass */}
            <rect
              x={b.x + 5}
              y={470 - b.h + 12}
              width="3"
              height={b.h - 30}
              rx="1.5"
              fill="#BFF7EC"
              opacity="0.16"
            />
          </g>
        ))}
      </g>

      {/* ── Amber spirit bottle, slightly forward ── */}
      <g opacity="0.75">
        <rect x="300" y="330" width="46" height="140" rx="14" fill="url(#ns-amber)" />
        <rect
          x="300" y="330" width="46" height="140" rx="14"
          fill="none" stroke="#FFB347" strokeOpacity="0.35"
        />
        <rect x="317" y="298" width="12" height="34" rx="4" fill="url(#ns-amber)" />
        <rect x="313" y="290" width="20" height="12" rx="4" fill="#3A2410" />
        <rect x="306" y="346" width="4" height="104" rx="2" fill="#FFE0B2" opacity="0.22" />
      </g>

      {/* ── The coupe, the piece the eye lands on ── */}
      <g transform="translate(150 250)">
        <ellipse cx="60" cy="228" rx="76" ry="12" fill="#00D4B4" opacity="0.13" filter="url(#ns-soft)" />

        {/* liquid, sitting inside the bowl */}
        <path d="M14 34 L106 34 L60 92 Z" fill="url(#ns-liquid)" />
        {/* surface line */}
        <rect x="14" y="32" width="92" height="3" rx="1.5" fill="#BFF7EC" opacity="0.6" />

        {/* bowl */}
        <path
          d="M8 28 L112 28 L60 96 Z"
          stroke="url(#ns-glass)"
          strokeWidth="3.5"
          strokeLinejoin="round"
          fill="none"
        />
        {/* stem and base */}
        <rect x="57.5" y="94" width="5" height="90" rx="2.5" fill="url(#ns-glass)" />
        <rect x="26" y="182" width="68" height="6" rx="3" fill="url(#ns-glass)" />
        <ellipse cx="60" cy="185" rx="34" ry="5" fill="#00D4B4" opacity="0.22" />

        {/* garnish */}
        <circle cx="98" cy="22" r="9" fill="#FFB347" opacity="0.85" />
        <circle cx="98" cy="22" r="9" fill="none" stroke="#FFD9A0" strokeOpacity="0.6" />

        {/* rim highlight */}
        <path d="M18 30 L46 30" stroke="#EAFFFA" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />

        {/* bubbles */}
        <circle cx="52" cy="58" r="2.4" fill="#EAFFFA" opacity="0.55" />
        <circle cx="66" cy="48" r="1.8" fill="#EAFFFA" opacity="0.45" />
        <circle cx="58" cy="72" r="1.5" fill="#EAFFFA" opacity="0.4" />
      </g>

      {/* Vignette, so the artwork sits behind the type rather than fighting it */}
      <rect width="480" height="640" fill="url(#ns-vig)" />
      <defs>
        <radialGradient id="ns-vig" cx="0.5" cy="0.45" r="0.78">
          <stop offset="55%" stopColor="#06090F" stopOpacity="0" />
          <stop offset="100%" stopColor="#06090F" stopOpacity="0.85" />
        </radialGradient>
      </defs>
    </svg>
  );
}
