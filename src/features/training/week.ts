/**
 * A week, as a coach's calendar draws it.
 *
 * Seven days in the club's zone, Monday first, with each slot placed on the
 * day it starts. The arithmetic is done on formatted local dates rather than
 * on UTC millis because the question is "which Sunday", and a slot at
 * 11 p.m. Saturday Pacific is Sunday in UTC — the wrong column, on the one
 * page whose whole job is the right column.
 *
 * Pure, and `now` is a parameter for the same reason it is everywhere else
 * here: a test for "this week" that reads the clock is a test that changes
 * meaning every Monday.
 */

export const TZ = "America/Los_Angeles";

/** YYYY-MM-DD in the zone. */
export function localDate(at: Date, timeZone = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** 0 = Monday … 6 = Sunday, in the zone. */
function weekday(at: Date, timeZone = TZ): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
}

/** Shift a YYYY-MM-DD by whole days, as a date string. */
export function addDays(yyyymmdd: string, days: number): string {
  const at = new Date(`${yyyymmdd}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The Monday of the week containing `at`, as YYYY-MM-DD. */
export function weekStart(at: Date, timeZone = TZ): string {
  return addDays(localDate(at, timeZone), -weekday(at, timeZone));
}

export type Day<T> = { date: string; label: string; items: T[] };

/**
 * Seven columns, each holding what starts on that day, in start order.
 *
 * Items outside the week are dropped rather than errored: the query fetches
 * a little either side so a late Sunday slot is not lost to the zone, and
 * the extra is noise here.
 */
export function week<T extends { startsAt: Date }>(
  monday: string,
  items: T[],
  timeZone = TZ,
): Day<T>[] {
  const days: Day<T>[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, label: dayLabel(date, timeZone), items: [] };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const item of [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    byDate.get(localDate(item.startsAt, timeZone))?.items.push(item);
  }
  return days;
}

/** "Sun 14 Sep". */
export function dayLabel(yyyymmdd: string, timeZone = TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${yyyymmdd}T12:00:00Z`));
}

/** "2:30 pm". */
export function timeLabel(at: Date, timeZone = TZ): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(at)
    .toLowerCase();
}

/** "2:30–3:30 pm", dropping the first suffix when both halves share it. */
export function spanLabel(startsAt: Date, endsAt: Date, timeZone = TZ): string {
  const a = timeLabel(startsAt, timeZone);
  const b = timeLabel(endsAt, timeZone);
  const suffix = (s: string) => s.slice(-2);
  return suffix(a) === suffix(b) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/**
 * The instant a local date and time name, in the zone.
 *
 * A form posts "2026-09-14" and "14:30" and means Pacific; building a Date
 * from that string directly would read it as UTC on the server and as
 * whatever the browser is set to in a test, neither of which is a Sunday
 * afternoon at Evergreen. So the offset is looked up for that moment rather
 * than assumed — it is the one line that decides whether the whole feature
 * is right by an hour twice a year.
 */
export function zonedInstant(yyyymmdd: string, hhmm: string, timeZone = TZ): Date {
  const guess = new Date(`${yyyymmdd}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  // The guess, read back in the zone, tells us the offset at that moment.
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
