import type { MetadataRoute } from "next";

import { db } from "@/db";
import { eventFreshness, eventIsIndexable } from "@/features/discovery/sitemap-entries";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Everything worth finding, offered to a crawler in one file.
 *
 * The gap this closes is the whole argument for the site. Google has no
 * EventConnect schedules at all, and asked about a team there it tells you to
 * phone the tournament director. We hold well over a thousand team pages and
 * a couple of thousand fixtures, and until now the only route to any of it was
 * a link from an event page somebody had already found — which for a team page
 * meant a fixture row three clicks deep.
 *
 * Team pages used to be most of this file by count. They are not here any
 * more, and neither are the events read off somebody else's platform: the
 * owner's decision on 2026-09-10 is that what other organizers publish is
 * theirs, and this directory should not be the copy a search engine indexes.
 * Both stay readable to anyone with the address — a parent following a link
 * to their child's fixture is the whole reason to hold it — they are simply
 * not offered up to be crawled. robots.txt says the same thing about
 * /teams/, and the two have to agree: a sitemap listing a page the robots
 * file forbids teaches a crawler to trust neither.
 *
 * What is left is the part that is ours to offer: the events we run, the
 * clubs and their reviews, and the writing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const now = new Date();
  const url = (path: string) => `${origin.replace(/\/$/, "")}${path}`;

  const [events, clubs, news] = await Promise.all([
    db.query.events.findMany({
      columns: {
        slug: true,
        updatedAt: true,
        status: true,
        visibility: true,
        startsAt: true,
        endsAt: true,
        sourcePlatform: true,
      },
    }),
    db.query.clubs.findMany({ columns: { slug: true, updatedAt: true } }),
    db.query.newsPosts.findMany({
      columns: { slug: true, updatedAt: true, status: true },
    }),
  ]);

  // The pages a reader starts from, and the ones robots.txt already allows.
  const roots: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/events"), changeFrequency: "daily", priority: 0.9 },
    { url: url("/clubs"), changeFrequency: "weekly", priority: 0.7 },
    { url: url("/coaches"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/community"), changeFrequency: "daily", priority: 0.6 },
    { url: url("/news"), changeFrequency: "weekly", priority: 0.6 },
    // Rarely changes, but it is the page somebody links to when they explain
    // the site to a club, so it should be findable.
    { url: url("/about"), changeFrequency: "yearly", priority: 0.4 },
  ];

  return [
    ...roots,
    ...events.filter(eventIsIndexable).map((e) => ({
      url: url(`/events/${e.slug}`),
      lastModified: e.updatedAt ?? undefined,
      ...eventFreshness(e, now),
    })),
    ...clubs.map((c) => ({
      url: url(`/clubs/${c.slug}`),
      lastModified: c.updatedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...news
      .filter((n) => n.status === "published")
      .map((n) => ({
        url: url(`/news/${n.slug}`),
        lastModified: n.updatedAt ?? undefined,
        changeFrequency: "monthly" as const,
        priority: 0.4,
      })),
  ];
}
