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
export function splitByTime<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  events: T[],
  now: Date,
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

  // A date-less event has not happened yet as far as anyone knows.
  const upcoming = events
    .filter((e) => {
      const end = finishes(e);
      return end === null || end >= now.getTime();
    })
    // Still sorted by when they start: "soonest first" is about when you need
    // to turn up, not when the thing wraps up.
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  const past = events
    .filter((e) => {
      const end = finishes(e);
      return end !== null && end < now.getTime();
    })
    .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
  return { upcoming, past };
}
