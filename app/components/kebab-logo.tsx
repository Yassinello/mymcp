interface KebabLogoProps {
  size?: number;
  className?: string;
  /** When true, renders with an internal amber→orange gradient and a flame */
  hot?: boolean;
}

/**
 * Kebab logo — vertical inverted-cone silhouette on a thin skewer.
 *
 * Earlier iterations stacked three different shapes (circle / square /
 * circle) to evoke "alternating ingredients on a horizontal pique".
 * That worked at 64px+ but at the favicon / sidebar size (16-26px) the
 * pieces blurred together and read as a generic abstract icon. The new
 * shape is a doner-style vertical inverted cone — wider at the top,
 * tapering down — which is recognizable at any size and stays legible
 * as a 16px favicon.
 *
 * Geometry (32×32 viewBox):
 *   - Vertical skewer rod centered at x=16, from y=2 to y=30.
 *   - Tiny handle dot at the very top.
 *   - Inverted cone: top edge wide (8 ↔ 24), bottom point at (16, 24).
 *     The cone is split with a faint center line so it doesn't read
 *     flat — gives it volume without adding stroke weight.
 *
 * Two modes:
 * - default: monochrome via `currentColor` — drop into any header.
 * - hot:    amber→orange→red gradient on the cone + flame at the
 *           bottom, for hero/OG/marketing surfaces.
 */
export function KebabLogo({ size = 24, className = "", hot = false }: KebabLogoProps) {
  const gradId = `kebab-grad-${hot ? "hot" : "mono"}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {hot && (
        <defs>
          <linearGradient id={gradId} x1="16" y1="6" x2="16" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="55%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      )}

      {/* Skewer rod — vertical, full height, thin enough to read as a stick */}
      <line
        x1="16"
        y1="2"
        x2="16"
        y2="30"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Handle cap at the top — tiny knob = grip */}
      <circle cx="16" cy="3.2" r="1.4" fill="currentColor" />

      {/* Inverted cone — the meat. Wide at the top, tapering to a point.
          Slightly rounded top edge so it doesn't read like a triangle. */}
      <path
        d="M8 7
           Q16 5 24 7
           L17.5 23.5
           Q16 24.5 14.5 23.5
           Z"
        fill={hot ? `url(#${gradId})` : "currentColor"}
      />

      {/* Subtle center-line groove — gives the cone volume without
          requiring a separate stroke color. Only visible at larger
          sizes; collapses to a hairline at favicon scale. */}
      <line
        x1="16"
        y1="6.5"
        x2="16"
        y2="23.5"
        stroke={hot ? "#dc2626" : "currentColor"}
        strokeWidth="0.5"
        opacity={hot ? 0.4 : 0.2}
      />

      {hot && (
        // Flame underneath — only in hot mode
        <path
          d="M13 27 Q14.5 24 16 26 Q17.5 23 19 26 Q19.5 28.5 16 29.5 Q12.5 28.5 13 27 Z"
          fill="#f59e0b"
          opacity="0.9"
        />
      )}
    </svg>
  );
}
