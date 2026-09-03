import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { events, posts } from "@/db/schema";

export async function listPublishedPosts() {
  return db.query.posts.findMany({
    where: eq(posts.status, "published"),
    orderBy: [desc(posts.publishedAt)],
  });
}

export async function listDraftPosts() {
  return db.query.posts.findMany({
    where: eq(posts.status, "draft"),
    orderBy: [desc(posts.updatedAt)],
  });
}

export async function getPost(slug: string) {
  const post = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  if (!post) return null;

  const featured = post.featuredEventIds.length
    ? await db.query.events.findMany({
        where: inArray(events.id, post.featuredEventIds),
        with: { venue: { columns: { name: true, city: true } } },
      })
    : [];

  // keep the author's ordering
  const order = new Map(post.featuredEventIds.map((id, i) => [id, i]));
  featured.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { ...post, events: featured };
}

/** Published, public events starting within the next `days` days. */
export async function upcomingEventsForDigest(days = 14) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  return db.query.events.findMany({
    where: and(
      eq(events.status, "published"),
      eq(events.visibility, "public"),
      gte(events.startsAt, now),
      lte(events.startsAt, until),
    ),
    orderBy: (e, { asc }) => [asc(e.startsAt)],
    with: { venue: { columns: { name: true, city: true } } },
  });
}
