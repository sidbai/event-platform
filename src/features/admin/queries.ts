import "server-only";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clubReviewReports,
  clubReviews,
  comments,
  events,
} from "@/db/schema";

export async function pendingEvents() {
  return db.query.events.findMany({
    where: eq(events.status, "pending"),
    orderBy: [desc(events.createdAt)],
    with: {
      venue: { columns: { name: true, city: true } },
    },
  });
}

export async function reportedComments() {
  return db.query.comments.findMany({
    where: and(gt(comments.reportCount, 0), isNull(comments.hiddenAt)),
    orderBy: [desc(comments.reportCount)],
    with: {
      author: { columns: { name: true, displayName: true, username: true, email: true } },
      discussion: { columns: { subjectType: true, subjectId: true } },
    },
  });
}

/**
 * Reviews with outstanding reports, most-reported first.
 *
 * Author identity is deliberately not selected: moderating a review should not
 * require knowing, or being tempted to look up, who wrote it.
 */
export async function reportedReviews() {
  const counts = await db
    .select({
      reviewId: clubReviewReports.reviewId,
      n: sql<number>`count(*)::int`,
      reasons: sql<string[]>`array_agg(distinct ${clubReviewReports.reason})`,
    })
    .from(clubReviewReports)
    .groupBy(clubReviewReports.reviewId);
  if (counts.length === 0) return [];

  const rows = await db.query.clubReviews.findMany({
    where: and(
      inArray(clubReviews.id, counts.map((c) => c.reviewId)),
      isNull(clubReviews.hiddenAt),
    ),
    with: { club: { columns: { name: true, slug: true } } },
  });

  const byId = new Map(counts.map((c) => [c.reviewId, c]));
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      club: r.club,
      reportCount: byId.get(r.id)?.n ?? 0,
      reasons: (byId.get(r.id)?.reasons ?? []).filter(Boolean),
    }))
    .sort((a, b) => b.reportCount - a.reportCount);
}
