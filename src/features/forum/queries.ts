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

/**
 * Visible reply count per post.
 *
 * A converted post's thread lives on its event, so the count has to come from
 * the event's discussion — otherwise every converted post reads as having no
 * replies. Both subjects are counted in one pass, then keyed back to the post.
 */
async function replyCounts(
  posts: { id: string; convertedEventId: string | null }[],
) {
  const subjectIds = [
    ...posts.map((p) => p.convertedEventId ?? p.id),
  ];
  if (subjectIds.length === 0) return new Map<string, number>();

  const rows = await db
    .select({
      sid: discussions.subjectId,
      n: sql<number>`count(*)::int`,
    })
    .from(comments)
    .innerJoin(discussions, eq(discussions.id, comments.discussionId))
    .where(
      and(
        inArray(discussions.subjectType, ["forum_post", "event"]),
        inArray(discussions.subjectId, subjectIds),
        isNull(comments.hiddenAt),
      ),
    )
    .groupBy(discussions.subjectId);

  const bySubject = new Map(rows.map((r) => [r.sid, r.n]));
  return new Map(
    posts.map((p) => [p.id, bySubject.get(p.convertedEventId ?? p.id) ?? 0]),
  );
}

export async function listForumPosts(
  category?: ForumCategory,
  /** Admins see hidden posts, badged, so moderated ones stay findable. */
  includeHidden = false,
) {
  const filters = [
    category ? eq(forumPosts.category, category) : undefined,
    includeHidden ? undefined : isNull(forumPosts.hiddenAt),
  ].filter(Boolean);

  // Converted posts stay in the feed, badged, and link through to their event.
  const posts = await db.query.forumPosts.findMany({
    where: filters.length > 0 ? and(...filters) : undefined,
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
      convertedEvent: { columns: { slug: true } },
    },
  });

  const counts = await replyCounts(posts);
  return posts.map((p) => ({
    ...p,
    replies: counts.get(p.id) ?? 0,
    /*
     * Always the post, even once converted.
     *
     * Linking straight to the event skipped every access check: an event whose
     * visibility was narrowed after conversion left a dead link in a public
     * feed. The post page holds the one access check and forwards from there.
     */
    href: `/community/${p.slug}`,
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

