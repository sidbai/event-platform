/**
 * How far back the Past section on /events reaches.
 *
 * The archive only grows. Every tournament this platform ever listed is a
 * page worth keeping — results, standings and rosters are what people come
 * back for months later — but all of them under one heading turns the events
 * page into a scroll where last weekend sits above last spring with nothing
 * to separate them.
 *
 * Only the past is scoped. Ongoing, upcoming and later-on are bounded by the
 * calendar itself, and a filter that hid a tournament happening this weekend
 * would be answering a question nobody asked.
 *
 * Pure, and takes `now`, so the page never reaches for the clock and the
 * boundaries can be tested at a date of the test's choosing.
 */
import { endOf } from "./completion";

export type PastRangeKey = "1m" | "3m" | "all";

export const PAST_RANGES: { key: PastRangeKey; label: string; days: number | null }[] = [
  { key: "1m", label: "Last month", days: 30 },
  { key: "3m", label: "Last 3 months", days: 90 },
  { key: "all", label: "All", days: null },
];

/**
 * Three months rather than one.
 *
 * A youth season runs in blocks, and the question somebody arrives with is
 * usually "how did we do this season" rather than "what happened in the last
 * four weeks". One month is a click away for anyone who wants it.
 */
export const DEFAULT_PAST_RANGE: PastRangeKey = "3m";

const DAY = 86_400_000;

/** Whatever came in on the query string, or the default. */
export function readPastRange(raw: string | undefined): PastRangeKey {
  const found = PAST_RANGES.find((r) => r.key === raw);
  return found ? found.key : DEFAULT_PAST_RANGE;
}

export function rangeDays(key: PastRangeKey): number | null {
  return PAST_RANGES.find((r) => r.key === key)?.days ?? null;
}

/**
 * The past events inside the chosen window.
 *
 * Measured from when an event FINISHED, the same fact that put it in the past
 * to begin with. Measuring from the start would drop a league that ran all
 * spring out of "last month" on the day it ended, which is the one month it
 * is most worth reading about.
 *
 * An event with no date cannot be in the past at all, so it never reaches
 * here; if one somehow does, it stays rather than being silently dropped by a
 * comparison against null.
 */
export function withinPastRange<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  events: T[],
  now: Date,
  key: PastRangeKey,
): T[] {
  const days = rangeDays(key);
  if (days === null) return events;
  const floor = now.getTime() - days * DAY;
  return events.filter((e) => {
    const end = endOf({ startsAt: e.startsAt, endsAt: e.endsAt ?? null });
    return end === null ? true : end.getTime() >= floor;
  });
}

/**
 * Whether the chips are worth showing at all.
 *
 * A row of ranges that all return the same list is three ways to press the
 * same button. They appear only once the archive is deep enough for the
 * narrow ones to actually hide something.
 */
export function pastRangesAreUseful<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  past: T[],
  now: Date,
): boolean {
  return withinPastRange(past, now, "1m").length < past.length;
}
