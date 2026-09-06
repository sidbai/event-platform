/**
 * When an event happens, as a person would say it.
 *
 * The schema has had ends_at since the beginning and nothing has ever read it,
 * because everything built so far was a single afternoon: a pickup game, a
 * scrimmage. A tournament is a weekend and a league is a season, and printing
 * only the first day of either is wrong in a way that matters — a parent
 * reading "September 12, 2026" against a league that runs to March has been
 * told something false.
 *
 * Pure, because the awkward cases are all boundaries — a range inside one
 * month, across two, across a new year — and each is a sentence that is
 * either right or slightly ridiculous.
 */

export type WhenStyle = "long" | "short";

const parts = (at: Date, timeZone: string | null) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
};

const fmt = (at: Date, timeZone: string | null, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timeZone ?? undefined }).format(
    at,
  );

/**
 * One line for a date, or a range.
 *
 * "long" is for the event's own page — it names the weekday, which is what
 * someone checks when deciding whether they are free. A range drops the
 * weekday: "Saturday, August 29 – Monday, August 31" is a mouthful, and by
 * then the useful fact is the span, not which days of the week they were.
 *
 * The en dash is deliberate; a hyphen between dates reads as a phone number.
 */
export function formatEventWhen(
  startsAt: Date | null,
  endsAt: Date | null,
  timeZone: string | null,
  style: WhenStyle = "long",
): string {
  if (!startsAt) return "Date TBD";

  const month = style === "long" ? "long" : "short";
  const single: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  // An end that is not after the start describes the same day, or bad data.
  // Either way the honest rendering is the single date.
  if (!endsAt || endsAt.getTime() <= startsAt.getTime()) {
    return fmt(startsAt, timeZone, single);
  }

  const a = parts(startsAt, timeZone);
  const b = parts(endsAt, timeZone);

  if (a.y === b.y && a.m === b.m && a.d === b.d) {
    return fmt(startsAt, timeZone, single);
  }

  if (a.y === b.y && a.m === b.m) {
    // "August 29–31, 2026": the month and year are said once.
    const head = fmt(startsAt, timeZone, { month, day: "numeric" });
    const tail = fmt(endsAt, timeZone, { day: "numeric" });
    return `${head}–${tail}, ${a.y}`;
  }

  if (a.y === b.y) {
    const head = fmt(startsAt, timeZone, { month, day: "numeric" });
    const tail = fmt(endsAt, timeZone, { month, day: "numeric" });
    return `${head} – ${tail}, ${a.y}`;
  }

  // A season that crosses New Year needs both years, or it reads as a typo.
  const head = fmt(startsAt, timeZone, { month, day: "numeric", year: "numeric" });
  const tail = fmt(endsAt, timeZone, { month, day: "numeric", year: "numeric" });
  return `${head} – ${tail}`;
}

/** Whether this event covers more than one day, in its own timezone. */
export function isMultiDay(
  startsAt: Date | null,
  endsAt: Date | null,
  timeZone: string | null,
): boolean {
  if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) return false;
  const a = parts(startsAt, timeZone);
  const b = parts(endsAt, timeZone);
  return a.y !== b.y || a.m !== b.m || a.d !== b.d;
}

/**
 * What the end-date field should suggest for this kind of event.
 *
 * A tournament runs for days and a league for months, and an organizer who is
 * told which is expected is less likely to leave the field empty and publish a
 * season that claims to last an afternoon.
 */
export function endDateHint(kind: string): string {
  if (kind === "tournament") return "Last day of the tournament.";
  if (kind === "league") return "Last day of the season.";
  return "Only if it runs across more than one day.";
}
