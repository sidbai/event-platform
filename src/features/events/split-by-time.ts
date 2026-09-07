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
import { endOf } from "./completion";

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
   *
   * endOf is shared with the lifecycle chip on purpose. Two definitions of
   * "finished" is two answers, and they were already disagreeing: a one-day
   * event with no end time counted as over the moment it kicked off here,
   * while the chip gave it the rest of the day. The same event would have
   * read "Ongoing" from inside the Past section.
   */
  const finishes = (e: T) => endOf({ startsAt: e.startsAt, endsAt: e.endsAt ?? null })?.getTime() ?? null;
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

  /*
   * Being played right now, which is the one thing somebody might act on in
   * the next hour. A dateless event is never ongoing — nobody knows when it
   * is, so it waits with the upcoming ones rather than claiming to be live.
   */
  const live = (e: T) => {
    const start = starts(e);
    return start !== null && start <= now.getTime() && !over(e);
  };

  const ongoing = events.filter(live).sort(soonest);
  const upcoming = events.filter((e) => !over(e) && !far(e) && !live(e)).sort(soonest);
  const future = events.filter((e) => !over(e) && far(e) && !live(e)).sort(soonest);
  const past = events
    .filter(over)
    .sort((a, b) => (starts(b) ?? 0) - (starts(a) ?? 0));

  return { ongoing, upcoming, past, future };
}
