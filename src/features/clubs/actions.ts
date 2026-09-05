"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  clubEdits,
  reviewReports,
  reviewVotes,
  reviews,
  clubs,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { checkRateLimit } from "@/features/rate-limit";
import { isOurBlobUrl, isPendingClubUrl } from "@/features/uploads/blob";
import { slugify } from "@/lib/slug";

import { canEditClub } from "./access";
import { ensureAnonHandle } from "./anon";
import {
  parseRating,
  parseReviewerRole,
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

  const gate = await checkRateLimit("entry:edit", user);
  if (!gate.ok) return { error: gate.message };

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

  // Only a logo this form just staged, for the same reason team crests are
  // restricted: an arbitrary blob URL could point at another club's file.
  const staged = get("crestUrl");

  const snapshot = {
    name,
    city: get("city") || null,
    website: get("website") || null,
    crestUrl: staged && isPendingClubUrl(staged) ? staged : null,
  };

  const [club] = await db
    .insert(clubs)
    .values({ slug, ...snapshot, createdBy: user.id, updatedBy: user.id })
    .returning({ id: clubs.id });

  // The club's first history row, so there is always something to revert to.
  await db
    .insert(clubEdits)
    .values({ clubId: club.id, editedBy: user.id, ...snapshot, summary: "Added the club" });

  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}


/** Create or update the signed-in user's review of a club. */
export async function saveReview(
  slug: string,
  _prev: ClubResult,
  formData: FormData,
): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a review." };

  const gate = await checkRateLimit("review:create", user);
  if (!gate.ok) return { error: gate.message };

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

  const reviewerRole = parseReviewerRole(formData.get("reviewerRole"));
  if (!reviewerRole) fieldErrors.reviewerRole = "Say how you know this club.";

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
    .insert(reviews)
    .values({
      subjectType: "club",
      subjectId: club.id,
      authorId: user.id,
      ratings,
      reviewerRole: reviewerRole!,
      title,
      body,
    })
    .onConflictDoUpdate({
      target: [reviews.subjectType, reviews.subjectId, reviews.authorId],
      set: { ratings, reviewerRole: reviewerRole!, title, body, updatedAt: new Date() },
    });

  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}

export async function toggleHelpful(slug: string, reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const existing = await db.query.reviewVotes.findFirst({
    where: and(
      eq(reviewVotes.reviewId, reviewId),
      eq(reviewVotes.userId, user.id),
    ),
  });

  if (existing) {
    await db
      .delete(reviewVotes)
      .where(
        and(
          eq(reviewVotes.reviewId, reviewId),
          eq(reviewVotes.userId, user.id),
        ),
      );
  } else {
    await db
      .insert(reviewVotes)
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
    .insert(reviewReports)
    .values({ reviewId, reporterId: user.id, reason })
    .onConflictDoNothing();

  revalidatePath(`/clubs/${slug}`);
}

/** Admin: hide a review without destroying it. */
export async function hideReview(reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(reviews)
    .set({ hiddenAt: new Date() })
    .where(eq(reviews.id, reviewId));
  revalidatePath("/admin");
}

/** Admin: dismiss the reports on a review and leave it up. */
export async function dismissReviewReports(reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db.delete(reviewReports).where(eq(reviewReports.reviewId, reviewId));
  revalidatePath("/admin");
}

export async function updateClub(
  slug: string,
  _prev: ClubResult,
  formData: FormData,
): Promise<ClubResult> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub()))
    return { error: "Sign in to edit this club." };

  const gate = await checkRateLimit("entry:edit", user);
  if (!gate.ok) return { error: gate.message };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  if (name.length < 2) return { fieldErrors: { name: "Give the club a name." } };

  const current = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { crestUrl: true },
  });

  await applyClubEdit(
    slug,
    {
      name,
      city: get("city") || null,
      website: get("website") || null,
      crestUrl: current?.crestUrl ?? null,
    },
    user.id,
    "Updated club details",
  );
  return { ok: true };
}

/** Save a logo uploaded straight from the club page. */
export async function setClubLogo(slug: string, url: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub())) return;
  // The browser reports this URL, so it is checked rather than trusted.
  if (!isOurBlobUrl(url)) return;
  const c = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { name: true, city: true, website: true },
  });
  if (!c) return;
  await applyClubEdit(slug, { ...c, crestUrl: url }, user.id, "Changed the logo");
}

export async function clearClubLogo(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub())) return;
  const c = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { name: true, city: true, website: true },
  });
  if (!c) return;
  await applyClubEdit(slug, { ...c, crestUrl: null }, user.id, "Removed the logo");
}

type ClubSnapshot = {
  name: string;
  city: string | null;
  website: string | null;
  crestUrl: string | null;
};

/**
 * Write the club's new state to both the club row and its history.
 *
 * Every path that changes a club goes through here, so there is no way to
 * modify one without leaving a trail — which is the whole basis for letting
 * anyone edit in the first place.
 */
async function applyClubEdit(
  slug: string,
  next: ClubSnapshot,
  editedBy: string,
  summary: string,
) {
  const [club] = await db
    .update(clubs)
    .set({ ...next, updatedBy: editedBy, updatedAt: new Date() })
    .where(eq(clubs.slug, slug))
    .returning({ id: clubs.id });
  if (!club) return;

  await db.insert(clubEdits).values({ clubId: club.id, editedBy, ...next, summary });

  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/clubs");
}

/** Restore a club to an earlier snapshot. The revert is itself recorded. */
export async function revertClub(slug: string, editId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub())) return;

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { id: true },
  });
  if (!club) return;

  // Scoped to this club, so an id from another club's history can't be
  // replayed onto this one.
  const target = await db.query.clubEdits.findFirst({
    where: and(eq(clubEdits.id, editId), eq(clubEdits.clubId, club.id)),
  });
  if (!target) return;

  await applyClubEdit(
    slug,
    {
      name: target.name,
      city: target.city,
      website: target.website,
      crestUrl: target.crestUrl,
    },
    user.id,
    "Reverted to an earlier version",
  );
}


/**
 * Hold a club at the top of the directory, or release it. Admin only.
 *
 * Deliberately not part of the seeder: it is an editorial choice about which
 * clubs lead the page, and a seed run must never quietly undo an unpin.
 */
export async function setClubPinned(
  slug: string,
  pinned: boolean,
): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  await db
    .update(clubs)
    .set({ pinned, updatedAt: new Date() })
    .where(eq(clubs.slug, slug));

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${slug}`);
  revalidatePath("/admin");
}
