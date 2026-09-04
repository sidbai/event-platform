"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { coachEdits, coaches, reviewReports, reviewVotes, reviews } from "@/db/schema";
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

const NAME_MAX = 80;
const TITLE_MAX = 120;
const BODY_MAX = 4000;

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
    columns: { id: true },
  });
  if (!coach) return { error: "That coach is gone." };

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

  const fieldErrors: Record<string, string> = {};
  if (!ratings) fieldErrors.ratings = "Rate every category.";
  if (!reviewerRole) fieldErrors.reviewerRole = "How did you know this coach?";
  // A coach cannot be reviewed by a stranger: the context fields are what make
  // this an experience report rather than a verdict on a person.
  if (!teamLabel) fieldErrors.teamLabel = "Which team was this?";
  if (!season) fieldErrors.season = "Which season?";
  if (yearsWith === null) fieldErrors.yearsWith = "How long were you with them?";
  if (recommends === null) fieldErrors.recommends = "Would you recommend them?";
  if (title.length < 4) fieldErrors.title = "Give it a headline.";
  if (title.length > TITLE_MAX) fieldErrors.title = "That headline is too long.";
  if (body.length < 40)
    fieldErrors.body = "Say a bit more — what actually happened over the season?";
  if (body.length > BODY_MAX) fieldErrors.body = "That's too long.";
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
