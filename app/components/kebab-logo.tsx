interface KebabLogoProps {
  size?: number;
  className?: string;
}

/**
 * Kebab skewer logo — a diagonal rod running from a small handle ring
 * (bottom-left) to a sharp tip (top-right), threaded with four pieces
 * that alternate circle / diamond / circle / diamond so the silhouette
 * reads as "brochette with meat + veggies" even at 16px. The handle
 * ring differentiates the grip end from the food and gives the icon a
 * stronger "real skewer" feel than a plain line would.
 *
 * Monochrome: everything uses `currentColor`, so the parent can set
 * the tone (amber for brand, white for reversed placements).
 */
export function KebabLogo({ size = 24, className = "" }: KebabLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Skewer rod — diagonal, round cap at tip for a "sharpened" feel */}
      <line
        x1="3.5"
        y1="20.5"
        x2="20.5"
        y2="3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Handle: small hollow ring marks the grip end */}
      <circle cx="2.8" cy="21.2" r="1.1" stroke="currentColor" strokeWidth="1" fill="none" />
      {/* Piece 1 (near handle): small round veg — onion */}
      <circle cx="7" cy="17" r="1.8" fill="currentColor" />
      {/* Piece 2: diamond — meat cube */}
      <rect
        x="8.6"
        y="11.6"
        width="3.8"
        height="3.8"
        rx="0.5"
        transform="rotate(45 10.5 13.5)"
        fill="currentColor"
      />
      {/* Piece 3: medium circle — tomato */}
      <circle cx="14" cy="10" r="2.1" fill="currentColor" />
      {/* Piece 4 (near tip): smaller diamond — pepper */}
      <rect
        x="15.4"
        y="5.4"
        width="3.2"
        height="3.2"
        rx="0.4"
        transform="rotate(45 17 7)"
        fill="currentColor"
      />
    </svg>
  );
}
