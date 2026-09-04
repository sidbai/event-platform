import "server-only";

import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { teamInvites } from "@/db/schema";
import { publicName, type CurrentUser } from "@/features/auth";
import { normalizeEmail } from "@/features/auth/admin";

import type { TeamRole } from "./access";

export type TeamInviteRow = {
  id: string;
  token: string;
  label: string;
  role: TeamRole;
  isEmail: boolean;
  status: "pending" | "accepted" | "declined";
};

export async function listTeamInvites(teamId: string): Promise<TeamInviteRow[]> {
  const rows = await db.query.teamInvites.findMany({
    where: eq(teamInvites.teamId, teamId),
    orderBy: [asc(teamInvites.createdAt)],
    with: {
      invitedUser: {
        columns: { displayName: true, name: true, username: true, email: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    label: r.invitedUser ? publicName(r.invitedUser) : (r.email ?? "someone"),
    role: r.role as TeamRole,
    isEmail: !r.invitedUser,
    status: r.status,
  }));
}

/** The signed-in user's own pending invite to this team, if any. */
export async function myPendingTeamInvite(
  teamId: string,
  user: CurrentUser | null,
) {
  if (!user) return null;
  const targets = [eq(teamInvites.invitedUserId, user.id)];
  if (user.email) targets.push(eq(teamInvites.email, normalizeEmail(user.email)));

  const row = await db.query.teamInvites.findFirst({
    where: and(
      eq(teamInvites.teamId, teamId),
      eq(teamInvites.status, "pending"),
      or(...targets),
    ),
    columns: { id: true, role: true },
  });
  return row ? { id: row.id, role: row.role as TeamRole } : null;
}
