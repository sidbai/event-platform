"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamClaims, teamMembers, teamNameProposals, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { checkRateLimit } from "@/features/rate-limit";

import { CLAIMED_ROLE, canRequestClaim, checkClaimNote, claimRefusal } from "./claim";
import { checkTeamName } from "./name";

export type ClaimResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/**
 * "This is my team."
 *
 * Records the request and nothing else — no team row is touched until an
 * admin says so. The note is required because there is nothing to verify it
 * against: no club directory of coaches, and no email to send to. That
 * sentence is the whole of what the decision rests on.
 */
export async function requestTeamClaim(
  slug: string,
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to claim a team." };

  const gate = await checkRateLimit("claim:create", user);
  if (!gate.ok) return { error: gate.message };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, ownerId: true, visibility: true },
  });
  if (!team) return { error: "That team is gone." };

  const existing = await db.query.teamClaims.findFirst({
    where: and(eq(teamClaims.teamId, team.id), eq(teamClaims.userId, user.id)),
    columns: { status: true },
  });

  const viewer = { id: user.id, admin: false };
  if (!canRequestClaim(team, viewer, existing?.status ?? null)) {
    // The rule's own words: "you already asked" and "somebody already has
    // this" are different things to the person reading them.
    return { error: claimRefusal(team, viewer, existing?.status ?? null)! };
  }

  const note = checkClaimNote(String(formData.get("note") ?? ""));
  if (!note.ok) return { fieldErrors: { note: note.error } };

  await db.insert(teamClaims).values({
    teamId: team.id,
    userId: user.id,
    note: note.note,
  });

  revalidatePath(`/teams/${slug}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Admin: grant a claim.
 *
 * Writes a team_members row as manager — not owner, and not teams.ownerId.
 * Enough to run the team; short of deleting it, hiding it, or removing other
 * people, so a wrong approval stays recoverable. It also leaves the row
 * mergeable, which teams.ownerId would not.
 */
export async function approveTeamClaim(claimId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const claim = await db.query.teamClaims.findFirst({
    where: eq(teamClaims.id, claimId),
    with: { team: { columns: { id: true, slug: true } } },
  });
  if (!claim?.team) return;

  await db
    .insert(teamMembers)
    .values({
      teamId: claim.team.id,
      userId: claim.userId,
      role: CLAIMED_ROLE,
      addedBy: user!.id,
    })
    // Already on the team in some other role: leave that alone rather than
    // quietly demoting an owner to manager.
    .onConflictDoNothing();

  await db
    .update(teamClaims)
    .set({ status: "approved", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(teamClaims.id, claimId));

  revalidatePath(`/teams/${claim.team.slug}`);
  revalidatePath("/admin");
}

/** Admin: refuse. The record stays, so a pattern of asking stays visible. */
export async function rejectTeamClaim(claimId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  await db
    .update(teamClaims)
    .set({ status: "rejected", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(teamClaims.id, claimId));

  revalidatePath("/admin");
}

/**
 * Propose a new name for a team.
 *
 * The one identity field a manager may touch, and only through here. An
 * imported name is whatever a platform published, so somebody has to be able
 * to fix it — but a club's team is named by the club, and an unchecked rename
 * could quietly restate whose team it is.
 */
export async function proposeTeamName(
  slug: string,
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, name: true },
  });
  if (!team) return { error: "That team is gone." };

  const { canManageTeam } = await import("./access");
  if (!(await canManageTeam(team.id)))
    return { error: "You don't manage this team." };

  const checked = checkTeamName(String(formData.get("name") ?? ""));
  if (!checked.ok) return { fieldErrors: { name: checked.error } };
  if (checked.name === team.name) return { fieldErrors: { name: "That is the name it has." } };

  const open = await db.query.teamNameProposals.findFirst({
    where: and(
      eq(teamNameProposals.teamId, team.id),
      eq(teamNameProposals.status, "pending"),
    ),
    columns: { id: true },
  });
  // One standing proposal per team: a second would put an admin in front of
  // two answers to the same question. Asking again replaces the first.
  if (open) {
    await db
      .update(teamNameProposals)
      .set({ proposedName: checked.name, proposedBy: user.id, currentName: team.name })
      .where(eq(teamNameProposals.id, open.id));
  } else {
    await db.insert(teamNameProposals).values({
      teamId: team.id,
      proposedBy: user.id,
      currentName: team.name,
      proposedName: checked.name,
    });
  }

  revalidatePath(`/teams/${slug}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Admin: accept a proposed name.
 *
 * The slug does not follow. Every fixture, standings row and search result
 * points at a team by slug, and moving it to tidy up an address nobody types
 * would break the pages that point at it.
 */
export async function approveTeamName(proposalId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const proposal = await db.query.teamNameProposals.findFirst({
    where: eq(teamNameProposals.id, proposalId),
    with: { team: { columns: { id: true, slug: true } } },
  });
  if (!proposal?.team) return;

  await db
    .update(teams)
    .set({ name: proposal.proposedName, updatedAt: new Date() })
    .where(eq(teams.id, proposal.team.id));
  await db
    .update(teamNameProposals)
    .set({ status: "approved", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(teamNameProposals.id, proposalId));

  revalidatePath(`/teams/${proposal.team.slug}`);
  revalidatePath("/admin");
}

/** Admin: refuse a proposed name, leaving the team as it is. */
export async function rejectTeamName(proposalId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  await db
    .update(teamNameProposals)
    .set({ status: "rejected", decidedBy: user!.id, decidedAt: new Date() })
    .where(eq(teamNameProposals.id, proposalId));

  revalidatePath("/admin");
}
