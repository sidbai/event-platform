/**
 * Which events the front page puts above the feed.
 *
 * The feed orders everything by when it appeared, which is right for news and
 * for a discussion and wrong for a tournament: five news posts in a week
 * pushed every event off the front page, and the site that exists to help
 * people find a game showed none. Events get a band of their own instead, so
 * neither kind can crowd out the other.
 *
 * What goes in it is what somebody can still act on — being played now, then
 * soonest first. When there is nothing ahead, the band shows what just
 * finished rather than disappearing: a tournament that ended on Sunday is the
 * thing people are looking for on Monday, and an empty front page in the
 * middle of a season is worse than a slightly stale one.
 *
 * Pure and takes `now`, so it is testable and so the page never has to decide
 * what "soon" means.
 */
import { splitByTime } from "@/features/events/split-by-time";

export type FeaturedMode = "ahead" | "recent";

/** How many fit before the band stops being a highlight and becomes a list. */
export const FEATURED_SIZE = 4;

export function pickFeatured<T extends { startsAt: Date | null; endsAt?: Date | null }>(
  events: T[],
  now: Date,
  limit: number = FEATURED_SIZE,
): { events: T[]; mode: FeaturedMode } {
  const { ongoing, upcoming, past, future } = splitByTime(events, now);

  /*
   * Ongoing, then soon, then far off — the order somebody would act on them.
   *
   * "Later on" is included rather than held back, because an empty band is
   * the failure this exists to fix. On a quiet week a tournament in November
   * is still the most useful thing on the page.
   */
  const ahead = [...ongoing, ...upcoming, ...future];
  if (ahead.length > 0) return { events: ahead.slice(0, limit), mode: "ahead" };

  return { events: past.slice(0, limit), mode: "recent" };
}
