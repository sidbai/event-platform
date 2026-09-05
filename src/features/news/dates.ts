/**
 * Showing the day an article is about.
 *
 * The value is a calendar day — "2026-08-29" — not an instant. Handing that
 * string to `new Date()` parses it as midnight UTC, and formatting THAT in a
 * Pacific timezone renders it as the 28th: the tournament moves a day for
 * everyone reading it from the city it was played in. So the date is
 * formatted in UTC, which is the only reading that keeps the day someone
 * typed the day everyone sees.
 */

export function formatEventDate(
  value: string | null,
  opts: { month: "short" | "long" } = { month: "long" },
): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: opts.month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Whether the posted date is worth showing alongside the event date.
 *
 * When a recap goes up the same day, saying both is noise.
 */
export function postedSeparately(
  eventDate: string | null,
  publishedAt: Date | null,
): boolean {
  if (!eventDate || !publishedAt) return false;
  const posted = publishedAt.toISOString().slice(0, 10);
  return posted !== eventDate;
}
