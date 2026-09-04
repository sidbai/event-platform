import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubEdits, clubs, reviewVotes, reviews } from "@/db/schema";

import { publicName } from "@/features/auth";

import { averageRatings, type Ratings } from "./constants";

const visible = isNull(reviews.hiddenAt);

/** Reviews of clubs, never of another subject that shares an id. */
const ofClub = (clubId: string) =>
  and(eq(reviews.subjectType, "club"), eq(reviews.subjectId, clubId), visible);

/**
 * Ratings arrive as free-form JSON, since the scales vary per subject. Reading
 * them back through the club's own six keys keeps the rest of the code honest:
 * a row missing one scores 0 for it rather than producing undefined.
 */
function ratingsOf(row: { ratings: Record<string, number> }): Ratings {
  const r = row.ratings;
  return {
    playerDevelopment: r.playerDevelopment ?? 0,
    coaching: r.coaching ?? 0,
    communication: r.communication ?? 0,
    clubCulture: r.clubCulture ?? 0,
    playingTime: r.playingTime ?? 0,
    value: r.value ?? 0,
  };
}

/** Club directory with each club's aggregate score. */
export async function listClubs() {
  const rows = await db.query.clubs.findMany({ orderBy: [asc(clubs.name)] });
  if (rows.length === 0) return [];

  // Fetched separately rather than through a relation: the join needs
  // subject_type too, which drizzle relations cannot express.
  const reviewRows = await db
    .select({ subjectId: reviews.subjectId, ratings: reviews.ratings })
    .from(reviews)
    .where(
      and(
        eq(reviews.subjectType, "club"),
        inArray(reviews.subjectId, rows.map((c) => c.id)),
        visible,
      ),
    );

  const byClub = new Map<string, Ratings[]>();
  for (const r of reviewRows) {
    const list = byClub.get(r.subjectId) ?? [];
    list.push(ratingsOf(r));
    byClub.set(r.subjectId, list);
  }

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    city: c.city,
    crestUrl: c.crestUrl,
    summary: averageRatings("club", byClub.get(c.id) ?? []),
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
  const rows = await db.query.reviews.findMany({
    where: ofClub(clubId),
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
  const rows = await db.query.reviews.findMany({
    where: ofClub(clubId),
    columns: { ratings: true },
  });
  return averageRatings("club", rows.map(ratingsOf));
}

/** The signed-in user's own review of a club, for edit-in-place. */
export async function myReview(clubId: string, userId: string) {
  const row = await db.query.reviews.findFirst({
    where: and(
      eq(reviews.subjectType, "club"),
      eq(reviews.subjectId, clubId),
      eq(reviews.authorId, userId),
    ),
  });
  // Callers want the six club scales, not the raw JSON.
  return row ? { ...row, ratings: ratingsOf(row) } : undefined;
}

export type ClubEditRow = {
  id: string;
  editor: string;
  summary: string;
  createdAt: Date;
  /** The current live version can't be reverted to — it's already applied. */
  isCurrent: boolean;
};

/** A club's edit history, newest first. */
export async function clubHistory(clubId: string): Promise<ClubEditRow[]> {
  const rows = await db.query.clubEdits.findMany({
    where: eq(clubEdits.clubId, clubId),
    orderBy: [desc(clubEdits.createdAt)],
    limit: 20,
    with: {
      editor: { columns: { displayName: true, name: true, username: true } },
    },
  });

  return rows.map((r, i) => ({
    id: r.id,
    editor: r.editor ? publicName(r.editor) : "the seed",
    summary: r.summary ?? "Edited",
    createdAt: r.createdAt,
    isCurrent: i === 0,
  }));
}
