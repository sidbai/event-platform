import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { likes } from "@/db/schema";

export type LikeSubject = "forum_post" | "news_post" | "comment";

export type LikeState = { count: number; mine: boolean };

/**
 * Counts and "did I like it" for many subjects at once.
 *
 * Two queries for a whole page rather than one pair per row — a feed of a
 * hundred posts should not be a hundred round trips.
 */
export async function likeStates(
  subjectType: LikeSubject,
  subjectIds: string[],
  userId: string | null,
): Promise<Map<string, LikeState>> {
  const out = new Map<string, LikeState>();
  if (subjectIds.length === 0) return out;

  const counts = await db
    .select({ subjectId: likes.subjectId, n: sql<number>`count(*)::int` })
    .from(likes)
    .where(
      and(
        eq(likes.subjectType, subjectType),
        inArray(likes.subjectId, subjectIds),
      ),
    )
    .groupBy(likes.subjectId);

  const mine = userId
    ? new Set(
        (
          await db.query.likes.findMany({
            where: and(
              eq(likes.subjectType, subjectType),
              inArray(likes.subjectId, subjectIds),
              eq(likes.userId, userId),
            ),
            columns: { subjectId: true },
          })
        ).map((r) => r.subjectId),
      )
    : new Set<string>();

  for (const id of subjectIds) {
    out.set(id, {
      count: counts.find((c) => c.subjectId === id)?.n ?? 0,
      mine: mine.has(id),
    });
  }
  return out;
}

/** One subject, for a detail page. */
export async function likeState(
  subjectType: LikeSubject,
  subjectId: string,
  userId: string | null,
): Promise<LikeState> {
  const states = await likeStates(subjectType, [subjectId], userId);
  return states.get(subjectId) ?? { count: 0, mine: false };
}
