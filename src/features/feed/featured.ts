/**
 * Which events the front page puts above the feed.
 *
 * The feed orders everything by when it appeared, which is right for news and
 * for a discussion and wrong for a tournament: five news posts in a week
 * pushed every event off the front page, and the site that exists to help
 * people find a game showed none. Events get a band of their own instead, so
 * neither kind can crowd out the other.
 *
 * What goes in it is what is on NOW, or nearly. Being played today, then
 * anything inside the next few weeks. A tournament in January is not "what's
 * on" — it is browsing, and /events is the calendar built for it.
 *
 * When nothing is on, the band shows what just finished rather than
 * disappearing: a tournament that ended on Sunday is the thing people are
 * looking up on Monday, and an empty front page in the middle of a season is
 * worse than a slightly stale one. Only when there is no recent result either
 * does it reach for the next thing on the calendar, however far off — a site
 * with one event in it should still show that event.
 *
 * Pure and takes `now`, so it is testable and so the page never has to decide
 * what "soon" means.
 */
import { splitByTime } from "@/features/events/split-by-time";

export type FeaturedMode = "now" | "recent" | "later";

/** How many fit before the band stops being a highlight and becomes a list. */
export const FEATURED_SIZE = 4;

/**
 * How far ahead still counts as "on".
 *
 * Three weeks. Long enough that a tournament people are already packing for
 * is on the front page, short enough that the band is never four things
 * nobody can act on for a month. The events page keeps the rest.
 */
export const SOON_DAYS = 21;

const DAY = 86_400_000;

export function pickFeatured<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  events: T[],
  now: Date,
  limit: number = FEATURED_SIZE,
): { events: T[]; mode: FeaturedMode } {
  const { ongoing, upcoming, past, future } = splitByTime(events, now);

  /*
   * The latest kick-off first, not the earliest.
   *
   * A league that started in August and runs to March is ongoing for seven
   * months. Sorted by start date it would sit at the top of the front page
   * for all of them, above a tournament that kicked off this morning — and
   * the tournament is the thing happening today.
   */
  const live = [...ongoing].sort(
    (a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0),
  );

  // Dateless events sit with the soon ones: nobody knows when it is, and the
  // front page is where whoever posted it would expect to find it.
  const soon = upcoming.filter(
    (e) => e.startsAt === null || e.startsAt.getTime() <= now.getTime() + SOON_DAYS * DAY,
  );

  const on = [...live, ...soon];
  if (on.length > 0) return { events: on.slice(0, limit), mode: "now" };

  if (past.length > 0) return { events: past.slice(0, limit), mode: "recent" };

  // Nothing on, nothing finished: a new listing months out is all there is,
  // and showing it beats an empty band.
  return { events: [...upcoming, ...future].slice(0, limit), mode: "later" };
}
