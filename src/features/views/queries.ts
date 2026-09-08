import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { pageViews } from "@/db/schema";

export type ViewSubject = "event" | "news_post" | "forum_post";

/**
 * Count one view.
 *
 * An upsert rather than a read-then-write: two readers opening the same page
 * at once would otherwise both read 41 and both write 42. Postgres does the
 * addition, so the count is right however many arrive together.
 */
export async function recordView(subjectType: ViewSubject, subjectId: string) {
  await db
    .insert(pageViews)
    .values({ subjectType, subjectId, views: 1 })
    .onConflictDoUpdate({
      target: [pageViews.subjectType, pageViews.subjectId],
      set: { views: sql`${pageViews.views} + 1`, updatedAt: new Date() },
    });
}

/** How many times one page has been opened. Zero until somebody has. */
export async function viewsOf(
  subjectType: ViewSubject,
  subjectId: string,
): Promise<number> {
  const row = await db.query.pageViews.findFirst({
    where: and(
      eq(pageViews.subjectType, subjectType),
      eq(pageViews.subjectId, subjectId),
    ),
    columns: { views: true },
  });
  return row?.views ?? 0;
}

/**
 * Counts for a list of pages, in one query.
 *
 * For a feed or an index: asking per row would be one round trip per card,
 * and a page of twenty cards would spend twenty of them on a number in small
 * grey text.
 */
export async function viewsFor(
  subjectType: ViewSubject,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: pageViews.subjectId, views: pageViews.views })
    .from(pageViews)
    .where(
      and(eq(pageViews.subjectType, subjectType), inArray(pageViews.subjectId, ids)),
    );
  return new Map(rows.map((r) => [r.id, r.views]));
}
