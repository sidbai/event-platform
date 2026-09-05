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
 * accumulate every avatar a person has ever had.
 *
 * ALWAYS called after the row is saved, never before. Deleting first means a
 * failed or interrupted save leaves the record pointing at a file that no
 * longer exists — a broken avatar with no way back — where deleting second
 * leaves at worst an orphaned blob nobody sees.
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

  const replaced = user.avatarUrl;
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, user.id));
  await forget(replaced);

  revalidatePath("/settings");
  if (user.username) revalidatePath(`/people/${user.username}`);
}

export async function clearMyAvatar(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const replaced = user.avatarUrl;
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id));
  await forget(replaced);

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

  const replaced = team.crestUrl;
  await db
    .update(teams)
    .set({ crestUrl: url, updatedAt: new Date() })
    .where(eq(teams.id, team.id));
  await forget(replaced);

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

  const replaced = team.crestUrl;
  await db
    .update(teams)
    .set({ crestUrl: null, updatedAt: new Date() })
    .where(eq(teams.id, team.id));
  await forget(replaced);

  revalidatePath(`/teams/${slug}`);
  revalidatePath(`/teams/${slug}/settings`);
  revalidatePath("/teams");
}
