import "server-only";

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clubEdits,
  clubs,
  comments,
  events,
  reviewReports,
  reviews,
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
      reviewId: reviewReports.reviewId,
      n: sql<number>`count(*)::int`,
      reasons: sql<string[]>`array_agg(distinct ${reviewReports.reason})`,
    })
    .from(reviewReports)
    .groupBy(reviewReports.reviewId);
  if (counts.length === 0) return [];

  const rows = await db.query.reviews.findMany({
    where: and(
      inArray(reviews.id, counts.map((c) => c.reviewId)),
      isNull(reviews.hiddenAt),
    ),
  });

  // Reviews are polymorphic, so the subject is resolved by hand. Only club
  // reviews exist today; a coach review would simply have no club here.
  const clubIds = rows.filter((r) => r.subjectType === "club").map((r) => r.subjectId);
  const clubRows =
    clubIds.length > 0
      ? await db.query.clubs.findMany({
          where: inArray(clubs.id, clubIds),
          columns: { id: true, name: true, slug: true },
        })
      : [];
  const clubById = new Map(clubRows.map((c) => [c.id, { name: c.name, slug: c.slug }]));

  const byId = new Map(counts.map((c) => [c.reviewId, c]));
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      club: r.subjectType === "club" ? (clubById.get(r.subjectId) ?? null) : null,
      reportCount: byId.get(r.id)?.n ?? 0,
      reasons: (byId.get(r.id)?.reasons ?? []).filter(Boolean),
    }))
    .sort((a, b) => b.reportCount - a.reportCount);
}

/**
 * Recent club edits across every club, so an admin can skim what the community
 * changed without having to police it club by club.
 */
export async function recentClubEdits() {
  const rows = await db.query.clubEdits.findMany({
    orderBy: [desc(clubEdits.createdAt)],
    limit: 15,
    with: {
      club: { columns: { name: true, slug: true } },
      editor: { columns: { username: true, displayName: true, name: true } },
    },
  });
  return rows
    // The seeded baselines aren't edits anyone made.
    .filter((r) => r.editedBy !== null)
    .map((r) => ({
      id: r.id,
      club: r.club,
      summary: r.summary ?? "Edited",
      editor: r.editor,
      createdAt: r.createdAt,
    }));
}
