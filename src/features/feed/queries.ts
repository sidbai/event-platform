import "server-only";

import { listEvents } from "@/features/events/queries";
import { listForumPosts } from "@/features/forum/queries";
import { listNews } from "@/features/news/queries";

import { dropSupersededPosts, mergeFeed } from "./merge";

type Common = { id: string; at: Date; href: string; title: string };

/**
 * One item in the home feed.
 *
 * A union rather than a lowest-common-denominator row: an event without its
 * date, or a post without its author, would be a worse card than the ones the
 * dedicated pages already show. The shared part is only what the ordering and
 * the link need.
 */
export type FeedItem =
  | (Common & {
      kind: "news";
      category: string;
      summary: string | null;
      author: string;
      comments: number;
    })
  | (Common & {
      kind: "event";
      startsAt: Date | null;
      timezone: string | null;
      venue: string | null;
      /** Passed straight to EventTags, which reads the event itself. */
      event: Awaited<ReturnType<typeof listEvents>>[number];
    })
  | (Common & {
      kind: "post";
      category: string;
      body: string;
      author: string;
      authorAvatar: string | null;
      replies: number;
      convertedToEvent: boolean;
    });

/**
 * Everything new across news, events and the forum, newest first.
 *
 * Each source is sorted by when the item APPEARED, not by when it is about:
 * an event announced this morning for October belongs at the top today, and
 * the card carries its date so the feed never has to sort by it.
 *
 * Events that have already started drop out. A feed is a list of things you
 * can still act on, and "come play on Saturday" for last Saturday is worse
 * than nothing — the past ones stay on /events, which is built to show them.
 */
export async function homeFeed(
  limit: number,
): Promise<{ items: FeedItem[]; now: number }> {
  // One clock for the whole render. Reading it in the page instead would be
  // impure in a component, and would also let "2h ago" be measured from a
  // different instant than the one that decided an event was still upcoming.
  const now = Date.now();
  const [news, events, posts] = await Promise.all([
    listNews(undefined, { limit, offset: 0 }),
    listEvents({ when: "upcoming" }),
    listForumPosts(undefined, false, { limit, offset: 0 }),
  ]);

  const newsItems: FeedItem[] = news.rows.map((n) => ({
    kind: "news",
    id: n.id,
    // Published is the moment it became public; createdAt could be far older
    // if it sat in drafts, which would file it under a week nobody saw it.
    at: n.publishedAt ?? n.createdAt,
    href: `/news/${n.slug}`,
    title: n.title,
    category: n.category,
    summary: n.summary,
    author: n.authorName,
    comments: n.comments,
  }));

  const eventItems: FeedItem[] = events.map((e) => ({
    kind: "event",
    id: e.id,
    at: e.createdAt,
    href: `/events/${e.slug}`,
    title: e.title,
    startsAt: e.startsAt,
    timezone: e.timezone,
    venue: e.venue?.name ?? null,
    event: e,
  }));

  const eventIds = new Set(events.map((e) => e.id));
  const postItems: FeedItem[] = dropSupersededPosts(posts.rows, eventIds).map((p) => ({
    kind: "post",
    id: p.id,
    // createdAt, not lastActivityAt: a reply to a months-old thread bumps it
    // on /community, which is a discussion list, but here it would push
    // genuinely new things down under something nobody has posted to in weeks.
    at: p.createdAt,
    href: p.href,
    title: p.title,
    category: p.category,
    body: p.body,
    author: p.authorName,
    authorAvatar: p.authorAvatar,
    replies: p.replies,
    convertedToEvent: p.convertedEvent !== null,
  }));

  return { items: mergeFeed([newsItems, eventItems, postItems], limit), now };
}
