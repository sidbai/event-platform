import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

/**
 * A user may manage a team if they own it, are a listed manager, or are an
 * admin. Pass the resolved `teamId`.
 */
export async function canManageTeam(teamId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;

  const owner = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { claimedBy: true },
  });
  if (owner?.claimedBy === user.id) return true;

  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)),
  });
  return Boolean(member);
}
