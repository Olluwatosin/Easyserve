interface EsLogoProps {
  size?: number;
  variant?: "solid" | "glass" | "glow-glass";
  className?: string;
}

const VARIANTS = {
  solid: {
    background: "linear-gradient(135deg, #00D4B4 0%, #00906B 100%)",
    border: "none",
    boxShadow: "0 0 22px rgba(0,212,180,0.35)",
    iconColor: "#071810",
  },
  glass: {
    background: "rgba(0,212,180,0.18)",
    border: "1px solid rgba(0,212,180,0.35)",
    boxShadow: "none",
    iconColor: "#00D4B4",
  },
  "glow-glass": {
    background:
      "linear-gradient(135deg, rgba(0,212,180,0.14) 0%, rgba(0,168,143,0.06) 100%)",
    border: "1px solid rgba(0,212,180,0.22)",
    boxShadow: "0 0 28px rgba(0,212,180,0.14)",
    iconColor: "#00D4B4",
  },
} as const;

export function EsLogo({
  size = 40,
  variant = "solid",
  className = "",
}: EsLogoProps) {
  const v = VARIANTS[variant];
  const radius = Math.round(size * 0.28);
  const iconSize = Math.round(size * 0.58);

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: v.background,
        border: v.border,
        boxShadow: v.boxShadow,
      }}
    >
      <CocktailIcon size={iconSize} color={v.iconColor} />
    </div>
  );
}

function CocktailIcon({ size, color }: { size: number; color: string }) {
  const fill =
    color === "#071810" ? "rgba(7,24,16,0.12)" : "rgba(0,212,180,0.1)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bowl: inverted triangle (martini shape) */}
      <path
        d="M2 4 L18 4 L10 14 Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={fill}
      />
      {/* Stem */}
      <line
        x1="10"
        y1="14"
        x2="10"
        y2="20"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* Base */}
      <line
        x1="6"
        y1="21.2"
        x2="14"
        y2="21.2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Sparkle: 4-point cross in upper-right corner */}
      <line
        x1="16.5"
        y1="0.8"
        x2="16.5"
        y2="3.8"
        stroke={color}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.75"
      />
      <line
        x1="15"
        y1="2.3"
        x2="18"
        y2="2.3"
        stroke={color}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}
