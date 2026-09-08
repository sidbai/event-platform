import "server-only";

import { listEvents } from "@/features/events/queries";
import { listForumPosts } from "@/features/forum/queries";
import { listNews } from "@/features/news/queries";

import { FEATURED_SIZE, pickFeatured, type FeaturedMode } from "./featured";
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
      kind: "post";
      category: string;
      body: string;
      author: string;
      authorAvatar: string | null;
      replies: number;
      convertedToEvent: boolean;
    });

/** An event on the front page's own band, with what its card needs. */
export type FeaturedEvent = Awaited<ReturnType<typeof listEvents>>[number];

/**
 * The front page: a band of events, and a feed of everything written.
 *
 * These used to be one list ordered by date, and the events lost. News,
 * community posts and events all landed in the same stream, five news posts
 * in a week filled it, and a site whose whole point is finding a game could
 * show a visitor no games at all. Sorting harder would not have fixed it —
 * an event matters because of when it is PLAYED, a post because of when it
 * was written, and one order cannot serve both.
 *
 * So they are two lists with two clocks. The band is picked by the calendar
 * and sits on top; the feed below is what people have written, newest first,
 * and can no longer crowd out a tournament by being busy.
 */
export async function homeFeed(
  limit: number,
): Promise<{
  featured: FeaturedEvent[];
  featuredMode: FeaturedMode;
  items: FeedItem[];
  now: number;
}> {
  // One clock for the whole render. Reading it in the page instead would be
  // impure in a component, and would also let "2h ago" be measured from a
  // different instant than the one that decided an event was still upcoming.
  const now = Date.now();
  const [news, events, posts] = await Promise.all([
    listNews(undefined, { limit, offset: 0 }),
    // Not filtered to upcoming: the band falls back to what just finished,
    // and a query that cannot see the past cannot offer it.
    listEvents(),
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

  const { events: featured, mode: featuredMode } = pickFeatured(
    events,
    new Date(now),
    FEATURED_SIZE,
  );

  // Built from the events actually on the band, not from every event there
  // is. A post is only worth hiding when the thing that replaced it is on
  // this page — otherwise a post converted to a tournament in January would
  // vanish along with the tournament, and neither would be here.
  const eventIds = new Set(featured.map((e) => e.id));
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

  return {
    featured,
    featuredMode,
    items: mergeFeed([newsItems, postItems], limit),
    now,
  };
}
