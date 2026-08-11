/**
 * Small relative-time formatter — French only, matching Phase 1's hardcoded
 * French UI (no i18n system ported yet). Avoids pulling in date-fns (~950 kB
 * on web, per-locale) for a single label; add it back if/when full i18n is
 * ported to mobile.
 */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.round(diffMs / 1000));

  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} j`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} sem.`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mois`;
  return `${Math.round(days / 365)} an${days >= 730 ? "s" : ""}`;
}
