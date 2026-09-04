import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { coachEdits, coaches, clubs, reviewVotes, reviews } from "@/db/schema";
import { publicName } from "@/features/auth";
import { averageRatings, type Ratings } from "@/features/reviews/constants";

const visible = isNull(reviews.hiddenAt);

const ofCoach = (coachId: string) =>
  and(eq(reviews.subjectType, "coach"), eq(reviews.subjectId, coachId), visible);

export async function getCoach(slug: string) {
  return db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    with: { club: { columns: { name: true, slug: true, crestUrl: true } } },
  });
}

/**
 * Coaches at a club, with a review COUNT and deliberately no score.
 *
 * Sorted by name, never by rating. A column of scores for named people side by
 * side is a leaderboard, and ranking individuals is the thing this feature must
 * not become — the number lives on the coach's own page, next to the context
 * that makes it readable.
 */
export async function coachesAtClub(clubId: string) {
  const rows = await db.query.coaches.findMany({
    where: eq(coaches.clubId, clubId),
    orderBy: [asc(coaches.name)],
  });
  if (rows.length === 0) return [];

  const counts = await db
    .select({ subjectId: reviews.subjectId, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(
      and(
        eq(reviews.subjectType, "coach"),
        inArray(reviews.subjectId, rows.map((c) => c.id)),
        visible,
      ),
    )
    .groupBy(reviews.subjectId);
  const byCoach = new Map(counts.map((c) => [c.subjectId, c.n]));

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    role: c.role,
    ageGroups: c.ageGroups ?? [],
    reviewCount: byCoach.get(c.id) ?? 0,
  }));
}

/** Every coach, for the Coaches tab. Alphabetical, never by score. */
export async function listCoaches() {
  const rows = await db.query.coaches.findMany({
    orderBy: [asc(coaches.name)],
    with: { club: { columns: { name: true, slug: true } } },
  });
  if (rows.length === 0) return [];

  const counts = await db
    .select({ subjectId: reviews.subjectId, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(
      and(
        eq(reviews.subjectType, "coach"),
        inArray(reviews.subjectId, rows.map((c) => c.id)),
        visible,
      ),
    )
    .groupBy(reviews.subjectId);
  const byCoach = new Map(counts.map((c) => [c.subjectId, c.n]));

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    role: c.role,
    ageGroups: c.ageGroups ?? [],
    club: c.club,
    reviewCount: byCoach.get(c.id) ?? 0,
  }));
}

export async function coachSummary(coachId: string) {
  const rows = await db.query.reviews.findMany({
    where: ofCoach(coachId),
    columns: { ratings: true },
  });
  return averageRatings("coach", rows.map((r) => r.ratings as Ratings));
}

/** Share of reviewers who would recommend, or null below the threshold. */
export async function coachRecommendation(coachId: string) {
  const rows = await db.query.reviews.findMany({
    where: ofCoach(coachId),
    columns: { recommends: true },
  });
  const answered = rows.filter((r) => r.recommends !== null);
  if (answered.length === 0) return null;
  const yes = answered.filter((r) => r.recommends === true).length;
  return { yes, total: answered.length };
}

/**
 * Reviews of a coach, newest first. Same anonymity rule as clubs: the author
 * is loaded only to resolve their pseudonym and mark their own review.
 */
export async function listCoachReviews(coachId: string, userId: string | null) {
  const rows = await db.query.reviews.findMany({
    where: ofCoach(coachId),
    orderBy: [desc(reviews.createdAt)],
    with: { author: { columns: { id: true, anonHandle: true } } },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ reviewId: reviewVotes.reviewId, n: sql<number>`count(*)::int` })
    .from(reviewVotes)
    .where(inArray(reviewVotes.reviewId, ids))
    .groupBy(reviewVotes.reviewId);
  const byReview = new Map(counts.map((c) => [c.reviewId, c.n]));

  const mineVotes = userId
    ? new Set(
        (
          await db.query.reviewVotes.findMany({
            where: and(
              inArray(reviewVotes.reviewId, ids),
              eq(reviewVotes.userId, userId),
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
    ratings: r.ratings as Ratings,
    reviewerRole: r.reviewerRole,
    teamLabel: r.teamLabel,
    season: r.season,
    yearsWith: r.yearsWith,
    recommends: r.recommends,
    anonHandle: r.author?.anonHandle ?? "anon",
    createdAt: r.createdAt,
    helpful: byReview.get(r.id) ?? 0,
    votedByMe: mineVotes.has(r.id),
    mine: Boolean(userId && r.author?.id === userId),
  }));
}

/** The signed-in user's own review of a coach, for edit-in-place. */
export async function myCoachReview(coachId: string, userId: string) {
  return db.query.reviews.findFirst({
    where: and(
      eq(reviews.subjectType, "coach"),
      eq(reviews.subjectId, coachId),
      eq(reviews.authorId, userId),
    ),
  });
}

/** Clubs to pick from when adding a coach. */
export async function clubOptions() {
  return db.query.clubs.findMany({
    orderBy: [asc(clubs.name)],
    columns: { id: true, name: true },
  });
}

export async function coachHistory(coachId: string) {
  const rows = await db.query.coachEdits.findMany({
    where: eq(coachEdits.coachId, coachId),
    orderBy: [desc(coachEdits.createdAt)],
    limit: 20,
    with: {
      editor: { columns: { displayName: true, name: true, username: true } },
    },
  });

  return rows.map((r, i) => ({
    id: r.id,
    editor: r.editor ? publicName(r.editor) : "unknown",
    summary: r.summary ?? "Edited",
    createdAt: r.createdAt,
    isCurrent: i === 0,
  }));
}
