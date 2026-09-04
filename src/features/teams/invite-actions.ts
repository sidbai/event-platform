"use server";

import { randomBytes } from "node:crypto";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamInvites, teamMembers, teams, users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { normalizeEmail } from "@/features/auth/admin";

import { canManageTeam, type TeamRole } from "./access";

export type TeamInviteResult = { error?: string; ok?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE: TeamRole[] = ["manager", "coach", "player"];

async function manageable(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true },
  });
  if (!team) return null;
  if (!(await canManageTeam(team.id))) return null;
  return { team, user };
}

/** Invite someone to a team by @username or email, in a role. */
export async function inviteToTeam(
  slug: string,
  _prev: TeamInviteResult,
  formData: FormData,
): Promise<TeamInviteResult> {
  const ctx = await manageable(slug);
  if (!ctx) return { error: "You can't invite people to this team." };

  const raw = String(formData.get("who") ?? "").trim();
  if (!raw) return { error: "Enter a username or email." };

  const roleRaw = String(formData.get("role") ?? "player") as TeamRole;
  // Owner is never invitable — it transfers, it isn't handed out.
  const role = INVITABLE.includes(roleRaw) ? roleRaw : "player";

  const handle = raw.replace(/^@/, "").toLowerCase();
  const byUsername = await db.query.users.findFirst({
    where: eq(users.username, handle),
    columns: { id: true },
  });

  let invitedUserId: string | null = byUsername?.id ?? null;
  let email: string | null = null;

  if (!invitedUserId) {
    if (!EMAIL_RE.test(raw)) return { error: `No user "@${handle}" — or use an email.` };
    const existing = await db.query.users.findFirst({
      where: eq(users.email, raw.trim().toLowerCase()),
      columns: { id: true },
    });
    if (existing) invitedUserId = existing.id;
    else email = normalizeEmail(raw);
  }

  if (invitedUserId) {
    const already = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, ctx.team.id),
        eq(teamMembers.userId, invitedUserId),
      ),
      columns: { userId: true },
    });
    if (already) return { error: "They're already on the team." };
  }

  const dupe = await db.query.teamInvites.findFirst({
    where: and(
      eq(teamInvites.teamId, ctx.team.id),
      invitedUserId
        ? eq(teamInvites.invitedUserId, invitedUserId)
        : eq(teamInvites.email, email!),
    ),
    columns: { id: true },
  });
  if (dupe) return { error: "Already invited." };

  await db.insert(teamInvites).values({
    teamId: ctx.team.id,
    invitedUserId,
    email,
    role,
    invitedBy: ctx.user.id,
    token: randomBytes(16).toString("base64url"),
  });

  revalidatePath(`/teams/${slug}/settings`);
  return { ok: `Invited ${raw} as ${role}.` };
}

export async function revokeTeamInvite(
  slug: string,
  inviteId: string,
): Promise<void> {
  const ctx = await manageable(slug);
  if (!ctx) return;
  await db
    .delete(teamInvites)
    .where(
      and(eq(teamInvites.id, inviteId), eq(teamInvites.teamId, ctx.team.id)),
    );
  revalidatePath(`/teams/${slug}/settings`);
}

/**
 * Accept a pending invite addressed to you. Matching mirrors event invites:
 * either the invite names your account, or its normalized email matches yours.
 */
export async function acceptTeamInvite(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true },
  });
  if (!team) return;

  const targets = [eq(teamInvites.invitedUserId, user.id)];
  if (user.email) targets.push(eq(teamInvites.email, normalizeEmail(user.email)));

  const invite = await db.query.teamInvites.findFirst({
    where: and(eq(teamInvites.teamId, team.id), or(...targets)),
  });
  if (!invite || invite.status !== "pending") return;

  await db
    .insert(teamMembers)
    .values({
      teamId: team.id,
      userId: user.id,
      role: invite.role,
      addedBy: invite.invitedBy,
    })
    .onConflictDoNothing();

  await db
    .update(teamInvites)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(teamInvites.id, invite.id));

  revalidatePath(`/teams/${slug}`);
}

export async function declineTeamInvite(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true },
  });
  if (!team) return;

  const targets = [eq(teamInvites.invitedUserId, user.id)];
  if (user.email) targets.push(eq(teamInvites.email, normalizeEmail(user.email)));

  await db
    .update(teamInvites)
    .set({ status: "declined", respondedAt: new Date() })
    .where(and(eq(teamInvites.teamId, team.id), or(...targets)));

  revalidatePath(`/teams/${slug}`);
}
