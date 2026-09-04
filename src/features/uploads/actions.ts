"use server";

import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { canManageTeam } from "@/features/teams/access";

import { isOurBlobUrl } from "./blob";

/**
 * Best-effort cleanup of the file a new upload replaces, so the store doesn't
 * accumulate every avatar a person has ever had. Never fatal — a stale blob is
 * much less bad than a failed save.
 */
async function forget(url: string | null) {
  if (!url || !isOurBlobUrl(url)) return;
  try {
    await del(url);
  } catch {
    // ignore
  }
}

export async function setMyAvatar(url: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  // The browser hands us this URL, so it has to be checked, not trusted.
  if (!isOurBlobUrl(url)) return;

  await forget(user.avatarUrl);
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, user.id));

  revalidatePath("/settings");
  if (user.username) revalidatePath(`/people/${user.username}`);
}

export async function clearMyAvatar(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await forget(user.avatarUrl);
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id));

  revalidatePath("/settings");
  if (user.username) revalidatePath(`/people/${user.username}`);
}

export async function setTeamCrest(slug: string, url: string): Promise<void> {
  if (!isOurBlobUrl(url)) return;
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, crestUrl: true },
  });
  if (!team || !(await canManageTeam(team.id))) return;

  await forget(team.crestUrl);
  await db
    .update(teams)
    .set({ crestUrl: url, updatedAt: new Date() })
    .where(eq(teams.id, team.id));

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  revalidatePath("/teams");
}

export async function clearTeamCrest(slug: string): Promise<void> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true, crestUrl: true },
  });
  if (!team || !(await canManageTeam(team.id))) return;

  await forget(team.crestUrl);
  await db
    .update(teams)
    .set({ crestUrl: null, updatedAt: new Date() })
    .where(eq(teams.id, team.id));

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  revalidatePath("/teams");
}
