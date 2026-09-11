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
  kind?: string | null,
): string {
  if (!startsAt) return "Date TBD";

  /*
   * A season with no end date is open-ended, not one day long.
   *
   * Leagues mostly do not publish an end: the RCL says "kickoff September
   * 12th & 13th" and leaves the rest to a schedule platform, and the WPL only
   * says it runs from after Labor Day to before Thanksgiving. Printing that
   * as a bare date makes a five-month season look like a single fixture.
   *
   * Only leagues. A tournament with a start and no end really is one day, and
   * saying "starts" about it would invent an open end it does not have.
   */
  if (kind === "league" && !endsAt) {
    return `Season starts ${fmt(startsAt, timeZone, seasonStart(style))}`;
  }

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
    /*
     * The same day with a real end is a slot, and the hours are the point.
     *
     * "Sunday, September 13, 2026 · 2:30–3:30 pm" is what a coach published
     * and what a parent is choosing between. Guarded on both ends: a start
     * at midnight is "no time given", and an end at 23:59 is "the end of the
     * day", which is how a one-day range is stored — neither is a time
     * anybody chose.
     */
    const clock = (at: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timeZone ?? undefined,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(at);
    const chosen = clock(startsAt) !== "00:00" && clock(endsAt) !== "23:59";
    return chosen
      ? `${fmt(startsAt, timeZone, single)} · ${span(startsAt, endsAt, timeZone)}`
      : fmt(startsAt, timeZone, single);
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

/** "2:30–3:30 pm", saying the suffix once when both ends share it. */
function span(startsAt: Date, endsAt: Date, timeZone: string | null): string {
  const t = (at: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone ?? undefined,
      hour: "numeric",
      minute: "2-digit",
    })
      .format(at)
      .toLowerCase();
  const [a, b] = [t(startsAt), t(endsAt)];
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** How the first day reads when it is all we know. */
const seasonStart = (style: WhenStyle): Intl.DateTimeFormatOptions =>
  style === "long"
    ? { month: "long", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };

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
