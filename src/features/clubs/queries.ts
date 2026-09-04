import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubReviewVotes, clubReviews, clubs } from "@/db/schema";

import { averageRatings, type Ratings } from "./constants";

const visible = isNull(clubReviews.hiddenAt);

function ratingsOf(row: Ratings): Ratings {
  return {
    playerDevelopment: row.playerDevelopment,
    coaching: row.coaching,
    communication: row.communication,
    clubCulture: row.clubCulture,
    playingTime: row.playingTime,
    value: row.value,
  };
}

/** Club directory with each club's aggregate score. */
export async function listClubs() {
  const rows = await db.query.clubs.findMany({
    orderBy: [asc(clubs.name)],
    with: {
      reviews: {
        where: visible,
        columns: {
          playerDevelopment: true,
          coaching: true,
          communication: true,
          clubCulture: true,
          playingTime: true,
          value: true,
        },
      },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    city: c.city,
    crestUrl: c.crestUrl,
    summary: averageRatings(c.reviews.map(ratingsOf)),
  }));
}

export async function getClub(slug: string) {
  return db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    with: { updatedByUser: { columns: { username: true, displayName: true, name: true } } },
  });
}

export type ReviewCard = {
  id: string;
  title: string;
  body: string;
  ratings: Ratings;
  overallForReview: Ratings;
  anonHandle: string;
  reviewerRole: string;
  createdAt: Date;
  helpful: number;
  votedByMe: boolean;
  mine: boolean;
};

/**
 * Reviews for a club, newest first.
 *
 * The author's account is loaded only to resolve their pseudonym and to mark
 * their own review — no user id, name or avatar reaches the caller.
 */
export async function listReviews(clubId: string, userId: string | null) {
  const rows = await db.query.clubReviews.findMany({
    where: and(eq(clubReviews.clubId, clubId), visible),
    orderBy: [desc(clubReviews.createdAt)],
    with: { author: { columns: { id: true, anonHandle: true } } },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ reviewId: clubReviewVotes.reviewId, n: sql<number>`count(*)::int` })
    .from(clubReviewVotes)
    .where(inArray(clubReviewVotes.reviewId, ids))
    .groupBy(clubReviewVotes.reviewId);
  const byReview = new Map(counts.map((c) => [c.reviewId, c.n]));

  const mineVotes = userId
    ? new Set(
        (
          await db.query.clubReviewVotes.findMany({
            where: and(
              inArray(clubReviewVotes.reviewId, ids),
              eq(clubReviewVotes.userId, userId),
            ),
            columns: { reviewId: true },
          })
        ).map((v) => v.reviewId),
      )
    : new Set<string>();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    ratings: ratingsOf(r),
    reviewerRole: r.reviewerRole,
    anonHandle: r.author?.anonHandle ?? "anon",
    createdAt: r.createdAt,
    helpful: byReview.get(r.id) ?? 0,
    votedByMe: mineVotes.has(r.id),
    mine: Boolean(userId && r.author?.id === userId),
  }));
}

export async function clubSummary(clubId: string) {
  const rows = await db.query.clubReviews.findMany({
    where: and(eq(clubReviews.clubId, clubId), visible),
    columns: {
      playerDevelopment: true,
      coaching: true,
      communication: true,
      clubCulture: true,
      playingTime: true,
      value: true,
    },
  });
  return averageRatings(rows.map(ratingsOf));
}

/** The signed-in user's own review of a club, for edit-in-place. */
export async function myReview(clubId: string, userId: string) {
  return db.query.clubReviews.findFirst({
    where: and(eq(clubReviews.clubId, clubId), eq(clubReviews.authorId, userId)),
  });
}
