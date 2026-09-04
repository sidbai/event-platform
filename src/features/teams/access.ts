import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

export type TeamRole = "owner" | "manager" | "coach" | "player";

/** Roles that may edit the team and invite people. */
const ADMIN_ROLES: TeamRole[] = ["owner", "manager"];
/** Roles that may put events on the team's calendar. */
const SCHEDULE_ROLES: TeamRole[] = ["owner", "manager", "coach"];

/** The user's role on a team, or null if they aren't a member. */
export async function teamRoleOf(
  teamId: string,
  userId: string,
): Promise<TeamRole | null> {
  const row = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
    columns: { role: true },
  });
  return (row?.role as TeamRole) ?? null;
}

async function check(teamId: string, allowed: TeamRole[]): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;

  // The original claimant owns the team even if the members row is missing —
  // teams claimed before team_members existed rely on this.
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { claimedBy: true },
  });
  if (team?.claimedBy === user.id) return true;

  const role = await teamRoleOf(teamId, user.id);
  return role !== null && allowed.includes(role);
}

/**
 * May edit the team and manage its people. Owner and manager only — note that
 * being *a member* is not enough, or every player could rename the team.
 */
export function canManageTeam(teamId: string): Promise<boolean> {
  return check(teamId, ADMIN_ROLES);
}

/** May create events for the team. Coaches can, on top of the admins. */
export function canScheduleForTeam(teamId: string): Promise<boolean> {
  return check(teamId, SCHEDULE_ROLES);
}

/** Any membership at all — gates seeing the team's private events. */
export async function isTeamMember(
  teamId: string,
  userId: string,
): Promise<boolean> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { claimedBy: true },
  });
  if (team?.claimedBy === userId) return true;
  return (await teamRoleOf(teamId, userId)) !== null;
}
