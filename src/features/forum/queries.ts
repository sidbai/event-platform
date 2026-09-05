import "server-only";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

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
  window?: { limit: number; offset: number },
) {
  const filters = [
    category ? eq(forumPosts.category, category) : undefined,
    includeHidden ? undefined : isNull(forumPosts.hiddenAt),
  ].filter(Boolean);
  const where = filters.length > 0 ? and(...filters) : undefined;

  // Was a bare limit of 100, which silently hid post 101 onwards.
  const total = await db.$count(forumPosts, where);

  // Converted posts stay in the feed, badged, and link through to their event.
  const posts = await db.query.forumPosts.findMany({
    where,
    orderBy: [desc(forumPosts.pinned), desc(forumPosts.lastActivityAt)],
    limit: window?.limit ?? 100,
    offset: window?.offset,
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
  const rows = posts.map((p) => ({
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
  return { rows, total };
}

/** % and _ are LIKE wildcards; a search for "50%" must not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Posts matching free text, for the site-wide search.
 *
 * Hidden posts are excluded outright — search must not be a way around
 * moderation, and unlike the feed there is no admin view here to badge them in.
 */
export async function searchForumPosts(q: string, limit = 20) {
  const term = `%${escapeLike(q)}%`;
  const posts = await db.query.forumPosts.findMany({
    where: and(
      isNull(forumPosts.hiddenAt),
      or(ilike(forumPosts.title, term), ilike(forumPosts.body, term)),
    ),
    orderBy: [desc(forumPosts.lastActivityAt)],
    limit,
    with: {
      author: {
        columns: { displayName: true, name: true, username: true, avatarUrl: true },
      },
      convertedEvent: { columns: { slug: true } },
    },
  });

  const counts = await replyCounts(posts);
  return posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body: p.body,
    category: p.category,
    lastActivityAt: p.lastActivityAt,
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

