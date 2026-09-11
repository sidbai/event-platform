import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { publicReview } from "@/features/reviews/anonymise";
import { searchTerms, startsWord } from "@/features/search/terms";
import {
  clubs,
  coachClaims,
  coachEdits,
  coaches,
  reviewReplies,
  reviewVotes,
  reviews,
} from "@/db/schema";
import { publicName } from "@/features/auth";
import { averageRatings, type Ratings } from "@/features/reviews/constants";

const visible = isNull(reviews.hiddenAt);

/** `includeHidden` is for admins: see [[listReviews]] in clubs/queries. */
const ofCoach = (coachId: string, includeHidden = false) =>
  includeHidden
    ? and(eq(reviews.subjectType, "coach"), eq(reviews.subjectId, coachId))
    : and(eq(reviews.subjectType, "coach"), eq(reviews.subjectId, coachId), visible);

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
export async function listCoaches(
  q?: string,
  window?: { limit: number; offset: number },
) {
  const terms = searchTerms(q);
  const where = terms.length
    ? and(
        ...terms.map((term) =>
          or(
            startsWord(coaches.name, term),
            // Club comes through a relation, which cannot filter the parent.
            inArray(
              coaches.clubId,
              db.select({ id: clubs.id }).from(clubs).where(startsWord(clubs.name, term)),
            ),
          ),
        ),
      )
    : undefined;

  // Counted before slicing, so the pager knows the size of the whole result
  // rather than of the page it is showing.
  const total = await db.$count(coaches, where);

  const rows = await db.query.coaches.findMany({
    where,
    orderBy: [asc(coaches.name)],
    limit: window?.limit,
    offset: window?.offset,
    with: { club: { columns: { name: true, slug: true } } },
  });
  if (rows.length === 0) return { rows: [], total };

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

  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      role: c.role,
      ageGroups: c.ageGroups ?? [],
      club: c.club,
      reviewCount: byCoach.get(c.id) ?? 0,
    })),
  };
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
export async function listCoachReviews(
  coachId: string,
  userId: string | null,
  includeHidden = false,
) {
  const rows = await db.query.reviews.findMany({
    where: ofCoach(coachId, includeHidden),
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

  const replies = new Map(
    (
      await db.query.reviewReplies.findMany({
        where: inArray(reviewReplies.reviewId, ids),
      })
    ).map((rep) => [rep.reviewId, rep]),
  );

  // publicReview decides what may leave with the author's identity attached.
  // The context fields below are the reviewer's own words about their team and
  // season — deliberately optional at the form, because in one metro area they
  // narrow who could have written this far more than any handle does.
  return rows.map((r) => ({
    ...publicReview(r, {
      userId,
      helpful: byReview.get(r.id) ?? 0,
      votedByMe: mineVotes.has(r.id),
    }),
    ratings: r.ratings as Ratings,
    teamLabel: r.teamLabel,
    season: r.season,
    yearsWith: r.yearsWith,
    recommends: r.recommends,
    reply: replies.get(r.id) ?? null,
  }));
}

/** This user's claim on this coach, if they have made one. */
export async function myClaim(coachId: string, userId: string) {
  return db.query.coachClaims.findFirst({
    where: and(eq(coachClaims.coachId, coachId), eq(coachClaims.userId, userId)),
    columns: { status: true },
  });
}

/** Claims waiting on an admin. */
export async function pendingCoachClaims() {
  const rows = await db.query.coachClaims.findMany({
    where: eq(coachClaims.status, "pending"),
    orderBy: [desc(coachClaims.createdAt)],
    with: {
      coach: { columns: { name: true, slug: true, claimedBy: true } },
      user: { columns: { displayName: true, name: true, username: true, email: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    note: c.note,
    createdAt: c.createdAt,
    coach: c.coach,
    who: c.user ? publicName(c.user) : "Someone",
    /*
     * What the provider says their name is. Never shown outside /admin.
     *
     * Carried beside the handle rather than instead of it: publicName is
     * anonymous everywhere now, so an admin judging a claim has nothing to
     * weigh unless this is passed deliberately. Same shape as the team
     * claims in teams/claim-queries.ts.
     */
    account: c.user?.name ?? null,
    email: c.user?.email ?? null,
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
      editor: { columns: { displayName: true, username: true } },
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
