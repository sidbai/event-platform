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
import { allowAnonymousReview } from "@/features/reviews/anon-gate";
import { isOurBlobUrl, isPendingClubUrl } from "@/features/uploads/blob";

import { canEditClub } from "./access";
import { createClubRow } from "./create";
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

  // Only a logo this form just staged, for the same reason team crests are
  // restricted: an arbitrary blob URL could point at another club's file.
  const staged = get("crestUrl");

  const { slug } = await createClubRow(
    {
      name,
      city: get("city") || null,
      website: get("website") || null,
      crestUrl: staged && isPendingClubUrl(staged) ? staged : null,
    },
    user.id,
  );

  revalidatePath("/clubs");
  redirect(`/clubs/${slug}`);
}


/** Create or update the signed-in user's review of a club. */
export async function saveReview(
  slug: string,
  _prev: ClubResult,
  formData: FormData,
): Promise<ClubResult> {
  /*
   * Signed in or not. An account is the stronger check and keeps the
   * one-per-person rule and the ability to edit; without one, the captcha and
   * a limit keyed on the connection stand in for it. Following Rate My
   * Professors, which takes anonymous ratings of named people and accepts that
   * it cannot then edit or trace them.
   */
  const user = await getCurrentUser();

  if (user) {
    const gate = await checkRateLimit("review:create", user);
    if (!gate.ok) return { error: gate.message };
  } else {
    const gate = await allowAnonymousReview();
    if (!gate.ok) return { error: gate.error };
  }

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

  if (user) {
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
        set: {
          ratings,
          reviewerRole: reviewerRole!,
          title,
          body,
          updatedAt: new Date(),
        },
      });
  } else {
    // A plain insert: with no author there is nothing for the upsert to
    // conflict on, and nothing to go back and edit later. That is the trade.
    await db.insert(reviews).values({
      subjectType: "club",
      subjectId: club.id,
      authorId: null,
      ratings,
      reviewerRole: reviewerRole!,
      title,
      body,
    });
  }

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

/**
 * Admin: take a review down, or put it back.
 *
 * Hidden rather than deleted, so a decision can be reversed and so the review
 * stays visible to whoever made it — a takedown nobody can inspect afterwards
 * is indistinguishable from losing the data.
 *
 * `revalidate` is where the admin acted. Moderation used to be reachable only
 * from the queue at /admin, which meant an admin reading a club page and
 * seeing something bad had to report it to themselves first. Now the control
 * is on the review, and the page it sits on needs refreshing too.
 */
export async function setReviewHidden(
  reviewId: string,
  hidden: boolean,
  revalidate: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(reviews)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(reviews.id, reviewId));
  revalidatePath("/admin");
  if (revalidate !== "/admin") revalidatePath(revalidate);
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

  const current = await currentSnapshot(slug);
  if (!current) return { error: "That club is gone." };

  const colours = get("colours");
  const ageBands = get("ageBands");
  const next: ClubSnapshot = {
    ...current,
    name,
    city: get("city") || null,
    website: get("website") || null,
    tiers: lines(get("tiers")),
    squadMarkers: lines(get("squadMarkers"), true),
    colours: COLOURS.has(colours) ? colours : null,
    ageBands: AGE_BANDS.has(ageBands) ? ageBands : null,
    branches: lines(get("branches"), true),
    about: get("about").slice(0, 20_000) || null,
    sources: lines(get("sources")).filter((u) => /^https?:\/\//i.test(u)),
  };
  const knowledge = (c: ClubSnapshot) =>
    JSON.stringify([c.tiers, c.squadMarkers, c.colours, c.ageBands, c.branches, c.about, c.sources]);

  await applyClubEdit(
    slug,
    next,
    user.id,
    knowledge(next) !== knowledge(current)
      ? "Edited how the club organises its teams"
      : "Updated club details",
  );
  return { ok: true };
}

const COLOURS = new Set(["tier", "squad", "mixed", "none"]);
const AGE_BANDS = new Set(["single-year", "two-year", "both"]);

/** One entry per line (and per comma, where asked), trimmed, blanks and repeats dropped, capped. */
function lines(raw: string, commasToo = false): string[] {
  const out: string[] = [];
  for (const part of raw.split(commasToo ? /[\n,]/ : /\n/)) {
    const v = part.trim().slice(0, 80);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 40) break;
  }
  return out;
}

/** Everything a snapshot holds, as the club has it now. */
async function currentSnapshot(slug: string): Promise<ClubSnapshot | null> {
  const c = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: {
      name: true,
      city: true,
      website: true,
      crestUrl: true,
      tiers: true,
      squadMarkers: true,
      colours: true,
      ageBands: true,
      branches: true,
      about: true,
      sources: true,
    },
  });
  return c ?? null;
}

/** Save a logo uploaded straight from the club page. */
export async function setClubLogo(slug: string, url: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub())) return;
  // The browser reports this URL, so it is checked rather than trusted.
  if (!isOurBlobUrl(url)) return;
  const c = await currentSnapshot(slug);
  if (!c) return;
  await applyClubEdit(slug, { ...c, crestUrl: url }, user.id, "Changed the logo");
  await carryToTeams(slug, url);
}

export async function clearClubLogo(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !(await canEditClub())) return;
  const c = await currentSnapshot(slug);
  if (!c) return;
  await applyClubEdit(slug, { ...c, crestUrl: null }, user.id, "Removed the logo");
  await carryToTeams(slug, null);
}

type ClubSnapshot = {
  name: string;
  city: string | null;
  website: string | null;
  crestUrl: string | null;
  tiers: string[];
  squadMarkers: string[];
  colours: string | null;
  ageBands: string | null;
  branches: string[];
  about: string | null;
  sources: string[];
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
    // A person has now touched it: the "read by a machine on …" line comes off.
    .set({ ...next, knowledgeReadAt: null, updatedBy: editedBy, updatedAt: new Date() })
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
      tiers: target.tiers,
      squadMarkers: target.squadMarkers,
      colours: target.colours,
      ageBands: target.ageBands,
      branches: target.branches,
      about: target.about,
      sources: target.sources,
    },
    user.id,
    `Restored the version from ${target.createdAt.toISOString().slice(0, 10)}`,
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

/**
 * A club's teams change with its logo.
 *
 * Teams carry a copy of it so that a page which forgets the fallback still
 * draws the right badge. A copy that never changes is the reason not to copy
 * at all, so this is the half that makes it safe — and it only touches teams
 * wearing the club's old crest or nothing, never one somebody uploaded for
 * the team itself.
 */
async function carryToTeams(slug: string, crestUrl: string | null): Promise<void> {
  const { rewear } = await import("@/features/teams/borrowed-crest");
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { id: true },
  });
  if (!club) return;
  const n = await rewear(club.id, crestUrl);
  if (n > 0) revalidatePath("/teams");
}
