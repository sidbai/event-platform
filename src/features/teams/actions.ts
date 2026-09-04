"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin, normalizeEmail } from "@/features/auth/admin";

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

export async function unclaimTeam(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [team] = await db
    .update(teams)
    .set({ claimedBy: null, verifiedAt: null, updatedAt: new Date() })
    .where(and(eq(teams.slug, slug), eq(teams.claimedBy, user.id)))
    .returning({ id: teams.id });

  if (team) {
    await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
  }

  revalidatePath(`/teams/${slug}`);
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

export async function addManager(
  slug: string,
  _prev: TeamFormResult,
  formData: FormData,
): Promise<TeamFormResult> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return { error: "Only the team owner can add managers." };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email.includes("@")) return { error: "Enter a valid email." };

  const target = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!target) {
    return { error: "No account with that email. Ask them to sign in once first." };
  }
  if (target.id === ctx.team.claimedBy) return { error: "They already own this team." };

  await db
    .insert(teamMembers)
    .values({
      teamId: ctx.team.id,
      userId: target.id,
      role: "manager",
      addedBy: ctx.user.id,
    })
    .onConflictDoNothing();

  revalidatePath(`/teams/${slug}/settings`);
  return { ok: true };
}

export async function removeManager(slug: string, userId: string): Promise<void> {
  const ctx = await ownerOnly(slug);
  if (!ctx) return;
  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, ctx.team.id),
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, "manager"),
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
    columns: { id: true, claimedBy: true },
    with: { members: { columns: { userId: true } } },
  });
  if (!team) return { error: "Not found." };
  const allowed =
    isAdmin(user) ||
    team.claimedBy === user.id ||
    team.members.some((m) => m.userId === user.id);
  if (!allowed) return { error: "You don't manage this team." };

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
