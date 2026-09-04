"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  clubReviewReports,
  clubReviewVotes,
  clubReviews,
  clubs,
  users,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { slugify } from "@/lib/slug";

import { generateAnonHandle } from "./anon";
import {
  parseRating,
  RATING_CATEGORIES,
  REPORT_REASONS,
  type ClubResult,
  type Ratings,
} from "./constants";

const TITLE_MAX = 120;
const BODY_MAX = 4000;

export async function createClub(
  _prev: ClubResult,
  formData: FormData,
): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to add a club." };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  if (name.length < 2) return { fieldErrors: { name: "Give the club a name." } };
  if (name.length > 80) return { fieldErrors: { name: "That name is too long." } };

  const base = slugify(name).slice(0, 60) || "club";
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.query.clubs.findFirst({
      where: eq(clubs.slug, candidate),
      columns: { id: true },
    });
    if (!clash) {
      slug = candidate;
      break;
    }
  }

  await db.insert(clubs).values({
    slug,
    name,
    city: get("city") || null,
    website: get("website") || null,
    createdBy: user.id,
  });

  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}

/**
 * Make sure the user has a pseudonym, creating one on first review.
 *
 * Generated lazily rather than at signup so accounts that predate reviews get
 * one too. The unique constraint is the real guard; the retry covers the
 * astronomically unlikely collision rather than trusting randomness alone.
 */
async function ensureAnonHandle(userId: string, existing: string | null) {
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const handle = generateAnonHandle();
    try {
      await db.update(users).set({ anonHandle: handle }).where(eq(users.id, userId));
      return handle;
    } catch {
      // unique violation — try another
    }
  }
  throw new Error("Could not allocate an anonymous handle.");
}

/** Create or update the signed-in user's review of a club. */
export async function saveReview(
  slug: string,
  _prev: ClubResult,
  formData: FormData,
): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a review." };

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { id: true },
  });
  if (!club) return { error: "That club is gone." };

  const fieldErrors: Record<string, string> = {};
  const ratings = {} as Ratings;
  for (const { key, label } of RATING_CATEGORIES) {
    const v = parseRating(formData.get(key));
    if (v === null) fieldErrors[key] = `Rate ${label}.`;
    else ratings[key] = v;
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 4) fieldErrors.title = "Give it a headline.";
  if (title.length > TITLE_MAX) fieldErrors.title = "That headline is too long.";
  if (body.length < 20)
    fieldErrors.body = "Say a bit more — a few sentences helps other parents.";
  if (body.length > BODY_MAX) fieldErrors.body = "That's too long.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  await ensureAnonHandle(user.id, user.anonHandle);

  // One review per person per club: writing again edits the one you have.
  await db
    .insert(clubReviews)
    .values({ clubId: club.id, authorId: user.id, ...ratings, title, body })
    .onConflictDoUpdate({
      target: [clubReviews.clubId, clubReviews.authorId],
      set: { ...ratings, title, body, updatedAt: new Date() },
    });

  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}

export async function toggleHelpful(slug: string, reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const existing = await db.query.clubReviewVotes.findFirst({
    where: and(
      eq(clubReviewVotes.reviewId, reviewId),
      eq(clubReviewVotes.userId, user.id),
    ),
  });

  if (existing) {
    await db
      .delete(clubReviewVotes)
      .where(
        and(
          eq(clubReviewVotes.reviewId, reviewId),
          eq(clubReviewVotes.userId, user.id),
        ),
      );
  } else {
    await db
      .insert(clubReviewVotes)
      .values({ reviewId, userId: user.id })
      .onConflictDoNothing();
  }

  revalidatePath(`/clubs/${slug}`);
}

export async function reportReview(
  slug: string,
  reviewId: string,
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const raw = String(formData.get("reason") ?? "");
  const reason = (REPORT_REASONS as readonly string[]).includes(raw) ? raw : null;

  await db
    .insert(clubReviewReports)
    .values({ reviewId, reporterId: user.id, reason })
    .onConflictDoNothing();

  revalidatePath(`/clubs/${slug}`);
}

/** Admin: hide a review without destroying it. */
export async function hideReview(reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(clubReviews)
    .set({ hiddenAt: new Date() })
    .where(eq(clubReviews.id, reviewId));
  revalidatePath("/admin");
}

/** Admin: dismiss the reports on a review and leave it up. */
export async function dismissReviewReports(reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db.delete(clubReviewReports).where(eq(clubReviewReports.reviewId, reviewId));
  revalidatePath("/admin");
}
