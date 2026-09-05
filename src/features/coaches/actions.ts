"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  coachClaims,
  coachEdits,
  coaches,
  reviewReplies,
  reviewReports,
  reviewVotes,
  reviews,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { ensureAnonHandle } from "@/features/clubs/anon";
import {
  COACH_REPORTS_TO_AUTOHIDE,
  parseReviewerRole,
  readRatings,
  reportReasonsFor,
  type ReviewResult,
} from "@/features/reviews/constants";
import { slugify } from "@/lib/slug";

import { canEditCoach } from "./access";
import { parseCoachRole } from "./constants";
import {
  canRemoveReply,
  canReplyToReview,
  canRequestClaim,
  canReviewCoach,
} from "./claim";
import { validateCoachReview } from "./review-rules";

const NAME_MAX = 80;

async function uniqueSlug(base: string, exceptId?: string) {
  const root = base || "coach";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.coaches.findFirst({
      where: eq(coaches.slug, candidate),
      columns: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function readAgeGroups(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Every change to a coach writes the resulting state to coach_edits as well,
 * so the history is append-only and a revert is just an older snapshot written
 * forward. Same shape as applyClubEdit.
 */
async function applyCoachEdit(
  coachId: string,
  next: { name: string; role: "head" | "assistant" | "director"; ageGroups: string[] },
  editedBy: string,
  summary: string,
) {
  await db
    .update(coaches)
    .set({ ...next, updatedBy: editedBy, updatedAt: new Date() })
    .where(eq(coaches.id, coachId));
  await db.insert(coachEdits).values({ coachId, editedBy, ...next, summary });
}

export async function createCoach(
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user || !(await canEditCoach()))
    return { error: "Sign in to add a coach." };

  const name = String(formData.get("name") ?? "").trim();
  const clubId = String(formData.get("clubId") ?? "");
  const role = parseCoachRole(formData.get("role"));
  const ageGroups = readAgeGroups(String(formData.get("ageGroups") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Who is the coach?";
  if (name.length > NAME_MAX) fieldErrors.name = "That name is too long.";
  if (!role) fieldErrors.role = "Pick a role.";
  if (!clubId) fieldErrors.clubId = "Pick the club they coach at.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // A coach only exists inside a club, so the club has to be a real one.
  const club = await db.query.clubs.findFirst({
    where: eq(sql`id`, sql`${clubId}::uuid`),
    columns: { id: true },
  });
  if (!club) return { fieldErrors: { clubId: "Pick the club they coach at." } };

  const slug = await uniqueSlug(slugify(name).slice(0, 60));
  const [created] = await db
    .insert(coaches)
    .values({
      slug,
      name,
      clubId: club.id,
      role: role!,
      ageGroups,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: coaches.id });

  // Baseline snapshot, so the original entry is always reachable in history.
  await db.insert(coachEdits).values({
    coachId: created.id,
    editedBy: user.id,
    name,
    role: role!,
    ageGroups,
    summary: "Added the coach",
  });

  revalidatePath("/coaches");
  redirect(`/coaches/${slug}`);
}

export async function updateCoach(
  slug: string,
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user || !(await canEditCoach())) return { error: "Sign in to edit." };

  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    columns: { id: true },
  });
  if (!coach) return { error: "That coach is gone." };

  const name = String(formData.get("name") ?? "").trim();
  const role = parseCoachRole(formData.get("role"));
  const ageGroups = readAgeGroups(String(formData.get("ageGroups") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Who is the coach?";
  if (name.length > NAME_MAX) fieldErrors.name = "That name is too long.";
  if (!role) fieldErrors.role = "Pick a role.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  await applyCoachEdit(
    coach.id,
    { name, role: role!, ageGroups },
    user.id,
    "Edited the details",
  );

  revalidatePath(`/coaches/${slug}`);
  revalidatePath("/coaches");
  return { ok: true };
}

/** Restore an earlier version. The revert is itself a new edit. */
export async function revertCoach(slug: string, editId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditCoach())) return;

  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    columns: { id: true },
  });
  if (!coach) return;

  // Scoped to this coach, so another coach's edit id cannot be replayed here.
  const snapshot = await db.query.coachEdits.findFirst({
    where: and(eq(coachEdits.id, editId), eq(coachEdits.coachId, coach.id)),
  });
  if (!snapshot) return;

  await applyCoachEdit(
    coach.id,
    { name: snapshot.name, role: snapshot.role, ageGroups: snapshot.ageGroups ?? [] },
    user.id,
    "Reverted to an earlier version",
  );

  revalidatePath(`/coaches/${slug}`);
}

export async function reviewCoach(
  slug: string,
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a review." };

  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    columns: { id: true, claimedBy: true },
  });
  if (!coach) return { error: "That coach is gone." };
  if (!canReviewCoach(coach, { id: user.id, admin: false }))
    return { error: "You can't review yourself." };

  const ratings = readRatings("coach", formData);
  const reviewerRole = parseReviewerRole(formData.get("reviewerRole"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const teamLabel = String(formData.get("teamLabel") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();
  const yearsRaw = Number(formData.get("yearsWith"));
  const yearsWith =
    Number.isInteger(yearsRaw) && yearsRaw >= 1 && yearsRaw <= 20 ? yearsRaw : null;
  const recommendRaw = String(formData.get("recommends") ?? "");
  const recommends =
    recommendRaw === "yes" ? true : recommendRaw === "no" ? false : null;

  const fieldErrors = validateCoachReview({
    ratings,
    reviewerRole,
    season,
    recommends,
    title,
    body,
    teamLabel,
    yearsWith,
  });
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  await ensureAnonHandle(user.id, user.anonHandle);

  await db
    .insert(reviews)
    .values({
      subjectType: "coach",
      subjectId: coach.id,
      authorId: user.id,
      ratings: ratings!,
      reviewerRole: reviewerRole!,
      title,
      body,
      teamLabel,
      season,
      yearsWith,
      recommends,
    })
    .onConflictDoUpdate({
      target: [reviews.subjectType, reviews.subjectId, reviews.authorId],
      set: {
        ratings: ratings!,
        reviewerRole: reviewerRole!,
        title,
        body,
        teamLabel,
        season,
        yearsWith,
        recommends,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/coaches/${slug}`);
  revalidatePath("/coaches");
  redirect(`/coaches/${slug}`);
}

export async function toggleCoachHelpful(
  slug: string,
  reviewId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const existing = await db.query.reviewVotes.findFirst({
    where: and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.userId, user.id)),
  });

  if (existing) {
    await db
      .delete(reviewVotes)
      .where(
        and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.userId, user.id)),
      );
  } else {
    await db
      .insert(reviewVotes)
      .values({ reviewId, userId: user.id })
      .onConflictDoNothing();
  }

  revalidatePath(`/coaches/${slug}`);
}

/**
 * Report a coach review, and take it down once enough people have.
 *
 * Club reviews are never auto-hidden; for a named person we hold first and
 * adjudicate second. Three things keep that from becoming a way to bury
 * criticism: the threshold ignores what the review says, so a glowing review
 * is hidden on the same terms as a damning one; the review is hidden, never
 * deleted; and it lands in the admin queue either way.
 */
export async function reportCoachReview(
  slug: string,
  reviewId: string,
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const raw = String(formData.get("reason") ?? "");
  const reason = reportReasonsFor("coach").includes(raw) ? raw : null;

  await db
    .insert(reviewReports)
    .values({ reviewId, reporterId: user.id, reason })
    .onConflictDoNothing();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewReports)
    .where(eq(reviewReports.reviewId, reviewId));

  if (n >= COACH_REPORTS_TO_AUTOHIDE) {
    await db
      .update(reviews)
      .set({ hiddenAt: new Date() })
      .where(
        and(
          eq(reviews.id, reviewId),
          eq(reviews.subjectType, "coach"),
          sql`${reviews.hiddenAt} is null`,
        ),
      );
    revalidatePath("/admin");
  }

  revalidatePath(`/coaches/${slug}`);
}

/** Admin: put an auto-hidden or hidden review back up. */
export async function restoreReview(reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db.delete(reviewReports).where(eq(reviewReports.reviewId, reviewId));
  await db.update(reviews).set({ hiddenAt: null }).where(eq(reviews.id, reviewId));
  revalidatePath("/admin");
}


/** Ask to be recognised as this coach. An admin decides. */
export async function requestCoachClaim(
  slug: string,
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to claim this page." };

  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    columns: { id: true, claimedBy: true },
  });
  if (!coach) return { error: "That coach is gone." };

  const existing = await db.query.coachClaims.findFirst({
    where: and(eq(coachClaims.coachId, coach.id), eq(coachClaims.userId, user.id)),
    columns: { status: true },
  });
  if (!canRequestClaim(coach, { id: user.id, admin: false }, existing?.status ?? null))
    return { error: "This page can't be claimed right now." };

  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (note.length < 10)
    return { fieldErrors: { note: "Tell us how we can tell it's you." } };

  await db.insert(coachClaims).values({ coachId: coach.id, userId: user.id, note });

  revalidatePath(`/coaches/${slug}`);
  revalidatePath("/admin");
  return { ok: true };
}

/** Admin: confirm a claim, which grants the right of reply and nothing else. */
export async function approveCoachClaim(claimId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const claim = await db.query.coachClaims.findFirst({
    where: eq(coachClaims.id, claimId),
    with: { coach: { columns: { slug: true, claimedBy: true } } },
  });
  // Never hand a page to a second person: an existing holder has to be
  // cleared deliberately first.
  if (!claim || claim.coach?.claimedBy) return;

  await db
    .update(coaches)
    .set({ claimedBy: claim.userId })
    .where(eq(coaches.id, claim.coachId));
  await db
    .update(coachClaims)
    .set({ status: "approved", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(coachClaims.id, claimId));

  revalidatePath(`/coaches/${claim.coach!.slug}`);
  revalidatePath("/admin");
}

/** Admin: refuse a claim. The record stays, so a pattern of asking is visible. */
export async function rejectCoachClaim(claimId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  await db
    .update(coachClaims)
    .set({ status: "rejected", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(coachClaims.id, claimId));

  revalidatePath("/admin");
}

/** Admin: release a claimed page, e.g. when the wrong person got it. */
export async function releaseCoachClaim(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;
  await db.update(coaches).set({ claimedBy: null }).where(eq(coaches.slug, slug));
  revalidatePath(`/coaches/${slug}`);
  revalidatePath("/admin");
}

/**
 * The coach's public answer to one review.
 *
 * Writing again edits the answer already there — one reply per review, so a
 * thread cannot turn into an argument with an anonymous reviewer.
 */
export async function replyToReview(
  slug: string,
  reviewId: string,
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to reply." };

  const coach = await db.query.coaches.findFirst({
    where: eq(coaches.slug, slug),
    columns: { id: true, claimedBy: true },
  });
  if (!coach) return { error: "That coach is gone." };
  if (!canReplyToReview(coach, { id: user.id, admin: false }))
    return { error: "Only this coach can reply here." };

  // The review has to be one of this coach's, or a claim would be a licence to
  // reply anywhere.
  const review = await db.query.reviews.findFirst({
    where: and(
      eq(reviews.id, reviewId),
      eq(reviews.subjectType, "coach"),
      eq(reviews.subjectId, coach.id),
    ),
    columns: { id: true },
  });
  if (!review) return { error: "That review is gone." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 10) return { fieldErrors: { body: "Say a little more." } };
  if (body.length > 2000) return { fieldErrors: { body: "That's too long." } };

  await db
    .insert(reviewReplies)
    .values({ reviewId, authorId: user.id, body })
    .onConflictDoUpdate({
      target: reviewReplies.reviewId,
      set: { body, updatedAt: new Date() },
    });

  revalidatePath(`/coaches/${slug}`);
  return { ok: true };
}

/** Take a reply down — its author, or an admin moderating it. */
export async function removeReply(slug: string, reviewId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const reply = await db.query.reviewReplies.findFirst({
    where: eq(reviewReplies.reviewId, reviewId),
    columns: { authorId: true },
  });
  if (!reply) return;
  if (!canRemoveReply(reply.authorId, { id: user.id, admin: isAdmin(user) })) return;

  await db.delete(reviewReplies).where(eq(reviewReplies.reviewId, reviewId));
  revalidatePath(`/coaches/${slug}`);
}
