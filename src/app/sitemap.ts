import type { MetadataRoute } from "next";

import { db } from "@/db";
import {
  eventFreshness,
  eventIsIndexable,
  teamIsIndexable,
} from "@/features/discovery/sitemap-entries";
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
 * Team pages are most of this file by count, and they are the point. A parent
 * searching for their child's team is the traffic that turns a scraped shell
 * into a claimed team, and a claimed team is the only part of this that
 * nobody can take away.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const now = new Date();
  const url = (path: string) => `${origin.replace(/\/$/, "")}${path}`;

  const [events, teams, clubs, news] = await Promise.all([
    db.query.events.findMany({
      columns: {
        slug: true,
        updatedAt: true,
        status: true,
        visibility: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    db.query.teams.findMany({
      columns: { slug: true, updatedAt: true, visibility: true, originEventId: true },
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
    { url: url("/teams"), changeFrequency: "weekly", priority: 0.7 },
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
    ...teams.filter(teamIsIndexable).map((t) => ({
      url: url(`/teams/${t.slug}`),
      lastModified: t.updatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
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
