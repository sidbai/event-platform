/**
 * Split a list into what you can still turn up to and what already happened.
 *
 * Pure and takes `now`, so it is testable without a database and so no
 * component has to reach for the clock itself.
 *
 * Its own module rather than living in queries.ts, which is server-only and
 * therefore not importable from a test — the same reason view-decision.ts and
 * claim.ts sit apart from their queries.
 */
/** How far ahead still counts as something to plan around. */
export const UPCOMING_HORIZON_DAYS = 60;

const DAY = 86_400_000;

export function splitByTime<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  events: T[],
  now: Date,
  horizonDays: number = UPCOMING_HORIZON_DAYS,
) {
  /*
   * An event is over when it FINISHES, not when it starts.
   *
   * Keyed on the start date, a league that runs September to March moved to
   * Past the day after its first matchday — filed under "already happened"
   * for the six months it was actually being played. Tournaments have the
   * same problem in miniature over a long weekend.
   */
  const finishes = (e: T) => e.endsAt?.getTime() ?? e.startsAt?.getTime() ?? null;
  const starts = (e: T) => e.startsAt?.getTime() ?? null;

  const horizon = now.getTime() + horizonDays * DAY;
  const soonest = (a: T, b: T) => (starts(a) ?? 0) - (starts(b) ?? 0);

  const over = (e: T) => {
    const end = finishes(e);
    return end !== null && end < now.getTime();
  };
  /*
   * Far enough off that it is browsing, not planning.
   *
   * A calendar that runs to next January puts a tournament five months away
   * beside one this weekend, and the one this weekend is what somebody came
   * for. The far ones keep their own section rather than being hidden — the
   * point is ordering, not concealment.
   *
   * A date-less event is never "future": nobody knows when it is, so it
   * belongs with the things still to be sorted out rather than filed under
   * next year.
   */
  const far = (e: T) => {
    const start = starts(e);
    return start !== null && start > horizon;
  };

  const upcoming = events.filter((e) => !over(e) && !far(e)).sort(soonest);
  const future = events.filter((e) => !over(e) && far(e)).sort(soonest);
  const past = events
    .filter(over)
    .sort((a, b) => (starts(b) ?? 0) - (starts(a) ?? 0));

  return { upcoming, past, future };
}
