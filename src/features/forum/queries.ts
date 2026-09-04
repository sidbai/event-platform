import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { comments, discussions, forumPosts } from "@/db/schema";
import { publicName } from "@/features/auth";

import type { ForumCategory } from "./constants";

function authorFields(a: {
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
} | null) {
  return {
    authorName: a ? publicName(a) : "Someone",
    authorUsername: a?.username ?? null,
    authorAvatar: a?.avatarUrl ?? null,
  };
}

async function replyCounts(postIds: string[]) {
  if (postIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      sid: discussions.subjectId,
      n: sql<number>`count(*)::int`,
    })
    .from(comments)
    .innerJoin(discussions, eq(discussions.id, comments.discussionId))
    .where(
      and(
        eq(discussions.subjectType, "forum_post"),
        inArray(discussions.subjectId, postIds),
        isNull(comments.hiddenAt),
      ),
    )
    .groupBy(discussions.subjectId);
  return new Map(rows.map((r) => [r.sid, r.n]));
}

export async function listForumPosts(category?: ForumCategory) {
  // Converted posts live on as events; their slug redirects there.
  const notConverted = isNull(forumPosts.convertedEventId);
  const posts = await db.query.forumPosts.findMany({
    where: category
      ? and(eq(forumPosts.category, category), notConverted)
      : notConverted,
    orderBy: [desc(forumPosts.pinned), desc(forumPosts.lastActivityAt)],
    limit: 100,
    with: {
      author: {
        columns: {
          displayName: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  const counts = await replyCounts(posts.map((p) => p.id));
  return posts.map((p) => ({
    ...p,
    replies: counts.get(p.id) ?? 0,
    ...authorFields(p.author),
  }));
}

export async function getForumPost(slug: string) {
  const post = await db.query.forumPosts.findFirst({
    where: eq(forumPosts.slug, slug),
    with: {
      author: {
        columns: {
          displayName: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
      convertedEvent: { columns: { slug: true } },
    },
  });
  if (!post) return null;
  return { ...post, ...authorFields(post.author) };
}

export async function countByCategory() {
  const rows = await db
    .select({ category: forumPosts.category, n: sql<number>`count(*)::int` })
    .from(forumPosts)
    .where(isNull(forumPosts.convertedEventId))
    .groupBy(forumPosts.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.n])) as Record<
    string,
    number
  >;
}

export async function ownForumPost(slug: string, userId: string) {
  const row = await db.query.forumPosts.findFirst({
    where: and(eq(forumPosts.slug, slug), eq(forumPosts.authorId, userId)),
    columns: { id: true },
  });
  return Boolean(row);
}
