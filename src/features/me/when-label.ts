/**
 * When something is, said the way a parent says it.
 *
 * "Tomorrow, 7:00 AM" beats "Sat, Sep 12, 7:00 AM" for anything this week,
 * and the date only earns its place once the weekday would be ambiguous. Two
 * lines, because the card puts the day above the hour.
 *
 * Pure, on a `now` and a zone, because "tomorrow" depends on both and a test
 * for it that reads the clock changes meaning at midnight.
 */

const TZ = "America/Los_Angeles";

function ymd(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export type WhenLabel = { day: string; time: string | null };

export function whenLabel(at: Date, timed: boolean, now: Date, timeZone = TZ): WhenLabel {
  const gap = daysBetween(ymd(now, timeZone), ymd(at, timeZone));
  const f = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(at);

  const day =
    gap === 0
      ? "Today"
      : gap === 1
        ? "Tomorrow"
        : gap > 1 && gap < 7
          ? f({ weekday: "long" })
          : f({ weekday: "short", month: "short", day: "numeric" });

  return { day, time: timed ? f({ hour: "numeric", minute: "2-digit" }) : null };
}
