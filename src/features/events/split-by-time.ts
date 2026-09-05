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
export function splitByTime<T extends { startsAt: Date | null }>(
  events: T[],
  now: Date,
) {
  // A date-less event has not happened yet as far as anyone knows.
  const upcoming = events
    .filter((e) => !e.startsAt || e.startsAt.getTime() >= now.getTime())
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  const past = events
    .filter((e) => e.startsAt && e.startsAt.getTime() < now.getTime())
    .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
  return { upcoming, past };
}
