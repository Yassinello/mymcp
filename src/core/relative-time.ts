/**
 * Pure relative-time formatter for UI freshness indicators.
 *
 * Bucketed format (D-12 — not full ISO):
 *   < 60s         → "just now"
 *   < 60min       → "Nm ago"
 *   < 24h         → "Nh ago"
 *   else          → "Nd ago"
 *   invalid input → "unknown"
 *   future input  → "just now" (clock-skew tolerance)
 *
 * Used by Overview banner to render the cron-cache freshness
 * (Phase 063 / CRON-03).
 */
export function formatRelativeTime(iso: string): string {
  if (!iso) return "unknown";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";

  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return "just now"; // includes future / clock-skew

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}
