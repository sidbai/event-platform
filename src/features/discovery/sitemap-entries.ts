/**
 * What belongs in the sitemap, and how much each thing is worth crawling.
 *
 * The whole argument for this site is that nobody can find these results.
 * Google has no EventConnect schedules at all and answers a question about a
 * team there by suggesting you phone the tournament director. We hold 1,223
 * team pages and roughly two thousand fixtures, and until now the only route
 * to any of it was a link from an event page somebody had already found.
 *
 * Pure, because "which of these is public" must agree exactly with the rule
 * the pages themselves enforce — a sitemap listing a page that 404s teaches a
 * crawler to trust the whole file less.
 */

import { endOf } from "@/features/events/completion";

export type ListedEvent = {
  slug: string;
  updatedAt: Date | null;
  status: string;
  visibility: string;
  startsAt: Date | null;
  endsAt: Date | null;
  /** The platform this event's schedule was read from, where it was read. */
  sourcePlatform?: string | null;
};

/**
 * Whether this event's schedule is somebody else's work.
 *
 * The owner's decision, 2026-09-10: what other organizers publish is theirs,
 * and this directory should not be the copy a search engine indexes. It stays
 * readable to anyone with the address — the point of holding it is that a
 * parent can find their child's fixture — but it is not offered up to be
 * crawled, and it is not in the sitemap.
 *
 * "manual" is not a platform. An event somebody typed in here was not taken
 * from anywhere.
 */
export function isImported(event: ListedEvent): boolean {
  const from = event.sourcePlatform;
  return typeof from === "string" && from !== "" && from !== "manual";
}

export type ListedTeam = {
  slug: string;
  updatedAt: Date | null;
  visibility: string;
  originEventId: string | null;
};

/**
 * The same rule the event pages enforce.
 *
 * Unlisted means reachable by link but never in a list, and a sitemap is the
 * most emphatic list there is — putting one in would undo the only thing
 * unlisted means.
 */
export function eventIsIndexable(event: ListedEvent): boolean {
  if (event.visibility !== "public") return false;
  if (isImported(event)) return false;
  return event.status === "published" || event.status === "completed";
}

/**
 * And the same rule team pages enforce.
 *
 * A team created for an event stays reachable while private, because public
 * standings link to it — teamViewDecision says so. A sitemap that disagreed
 * would either hide almost everything we hold or advertise pages that 404.
 */
export function teamIsIndexable(team: ListedTeam): boolean {
  return team.visibility === "public";
}

export type Freshness = {
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

/**
 * How often a crawler should come back.
 *
 * An event being played changes every few minutes; one that finished last
 * summer will never change again. Saying so is the difference between this
 * weekend's results being found today and being found next month.
 */
export function eventFreshness(event: ListedEvent, now: Date): Freshness {
  const start = event.startsAt?.getTime() ?? null;
  // The third place needing "when is this actually over", so it is imported
  // rather than derived again: a one-day event with no end time gets the rest
  // of its day, and two modules disagreeing about that put a tournament being
  // played into the same crawl bucket as one from last summer.
  const end = endOf(event)?.getTime() ?? null;
  const t = now.getTime();

  if (start !== null && end !== null && t >= start && t <= end) {
    return { changeFrequency: "daily", priority: 0.9 };
  }
  if (start !== null && t < start) return { changeFrequency: "weekly", priority: 0.8 };
  return { changeFrequency: "yearly", priority: 0.5 };
}
