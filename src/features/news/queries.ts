import "server-only";

import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { comments, discussions, newsPosts } from "@/db/schema";
import { publicName } from "@/features/auth";

import type { NewsCategory } from "./constants";

/** Published only — drafts are visible to admins through the admin list. */
const live = and(
  eq(newsPosts.status, "published"),
  isNotNull(newsPosts.publishedAt),
);

async function commentCounts(postIds: string[]) {
  if (postIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ sid: discussions.subjectId, n: sql<number>`count(*)::int` })
    .from(comments)
    .innerJoin(discussions, eq(discussions.id, comments.discussionId))
    .where(
      and(
        eq(discussions.subjectType, "news_post"),
        inArray(discussions.subjectId, postIds),
        sql`${comments.hiddenAt} is null`,
      ),
    )
    .groupBy(discussions.subjectId);
  return new Map(rows.map((r) => [r.sid, r.n]));
}

export async function listNews(
  category?: NewsCategory,
  window?: { limit: number; offset: number },
) {
  const where = category ? and(live, eq(newsPosts.category, category)) : live;
  // Was a bare limit of 40: post 41 simply never appeared, and nothing said so.
  const total = await db.$count(newsPosts, where);

  const rows = await db.query.newsPosts.findMany({
    where,
    orderBy: [desc(newsPosts.publishedAt)],
    limit: window?.limit ?? 40,
    offset: window?.offset,
    with: {
      author: { columns: { displayName: true, name: true, username: true } },
    },
  });

  const counts = await commentCounts(rows.map((r) => r.id));
  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      authorName: r.author ? publicName(r.author) : "King Juan Soccer",
      comments: counts.get(r.id) ?? 0,
    })),
  };
}

export async function getNewsPost(slug: string) {
  const post = await db.query.newsPosts.findFirst({
    where: eq(newsPosts.slug, slug),
    with: {
      author: { columns: { displayName: true, name: true, username: true } },
    },
  });
  if (!post) return null;
  return {
    ...post,
    authorName: post.author ? publicName(post.author) : "King Juan Soccer",
  };
}

/**
 * An author's own drafts and submissions, for the "Your posts" strip on the
 * index — otherwise a contributor sends a post for review and has no way back
 * to it, since unpublished posts are absent from the index by design.
 */
export async function myNewsSubmissions(userId: string) {
  return db.query.newsPosts.findMany({
    where: and(eq(newsPosts.authorId, userId), ne(newsPosts.status, "published")),
    orderBy: [desc(newsPosts.updatedAt)],
    limit: 10,
    columns: { slug: true, title: true, status: true, reviewNote: true },
  });
}

/** Submissions waiting on an editor. */
export async function pendingNews() {
  return db.query.newsPosts.findMany({
    where: eq(newsPosts.status, "pending"),
    orderBy: [desc(newsPosts.updatedAt)],
    with: {
      author: { columns: { displayName: true, name: true, username: true } },
    },
  });
}

/** Everything including drafts, for the admin index. */
export async function listAllNews() {
  return db.query.newsPosts.findMany({
    orderBy: [desc(newsPosts.updatedAt)],
    limit: 60,
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
      category: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}
