"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { eventOffers, eventTeams, matches, teamMembers, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { canManageTeam } from "./access";

export type TeamFormResult = { error?: string; ok?: boolean };

export async function claimTeam(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [team] = await db
    .update(teams)
    .set({ claimedBy: user.id, visibility: "public", updatedAt: new Date() })
    .where(and(eq(teams.slug, slug), isNull(teams.claimedBy)))
    .returning({ id: teams.id });

  if (team) {
    await db
      .insert(teamMembers)
      .values({ teamId: team.id, userId: user.id, role: "owner" })
      .onConflictDoNothing();
  }

  revalidatePath(`/teams/${slug}`);
  revalidatePath("/teams");
}

export async function verifyTeam(teamId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(teams)
    .set({ verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(teams.id, teamId));
  revalidatePath("/admin");
}

export async function rejectClaim(teamId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(teams)
    .set({ claimedBy: null, verifiedAt: null, updatedAt: new Date() })
    .where(eq(teams.id, teamId));
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  revalidatePath("/admin");
}

/** Admin: make a private (event) team public without a claimant. */
export async function promoteTeam(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return;
  await db
    .update(teams)
    .set({ visibility: "public", updatedAt: new Date() })
    .where(eq(teams.slug, slug));
  revalidatePath(`/teams/${slug}`);
  revalidatePath("/teams");
}

async function ownerOnly(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, claimedBy: true },
  });
  if (!team) return null;
  if (team.claimedBy !== user.id && !isAdmin(user)) return null;
  return { user, team };
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return;
  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, ctx.team.id),
        eq(teamMembers.userId, userId),
        ne(teamMembers.role, "owner"),
      ),
    );
  revalidatePath(`/teams/${slug}/settings`);
}

export async function updateTeam(
  slug: string,
  _prev: TeamFormResult,
  formData: FormData,
): Promise<TeamFormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true },
  });
  if (!team) return { error: "Not found." };
  // Owner/manager only — being on the roster is not the same as running it.
  if (!(await canManageTeam(team.id)))
    return { error: "You don't manage this team." };

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  await db
    .update(teams)
    .set({
      club: get("club"),
      city: get("city"),
      ageGroup: get("ageGroup"),
      gender: get("gender"),
      bio: get("bio"),
      updatedAt: new Date(),
    })
    .where(eq(teams.id, team.id));

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  return { ok: true };
}

/**
 * Delete a team outright. Owner or admin.
 *
 * Refused while anything competitive still points at the team. The database
 * would block it anyway — event_teams, matches and event_offers all reference
 * teams with NO ACTION — but a raw foreign-key error is not an answer, and
 * silently deleting a King Juan Cup side would take its standings with it.
 * team_members and team_invites cascade; events.host_team_id nulls itself.
 */
export async function deleteTeam(slug: string): Promise<TeamFormResult> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return { error: "Only the owner can delete this team." };

  const inEvent = await db.query.eventTeams.findFirst({
    where: eq(eventTeams.teamId, ctx.team.id),
    columns: { id: true },
    with: { event: { columns: { title: true } } },
  });
  if (inEvent) {
    return {
      error: `This team is registered for ${inEvent.event?.title ?? "an event"}, so it can't be deleted. Deleting it would take that event's results with it.`,
    };
  }

  const played = await db.query.matches.findFirst({
    where: or(
      eq(matches.homeTeamId, ctx.team.id),
      eq(matches.awayTeamId, ctx.team.id),
    ),
    columns: { id: true },
  });
  if (played) return { error: "This team has matches on record, so it can't be deleted." };

  const offered = await db.query.eventOffers.findFirst({
    where: eq(eventOffers.fromTeamId, ctx.team.id),
    columns: { id: true },
  });
  if (offered) {
    return { error: "This team has offered to play an event, so it can't be deleted." };
  }

  await db.delete(teams).where(eq(teams.id, ctx.team.id));
  revalidatePath("/teams");
  redirect("/teams");
}
