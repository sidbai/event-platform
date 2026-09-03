"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

export async function claimTeam(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await db
    .update(teams)
    .set({ claimedBy: user.id, updatedAt: new Date() })
    .where(and(eq(teams.slug, slug), isNull(teams.claimedBy)));

  revalidatePath(`/teams/${slug}`);
}

export async function unclaimTeam(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await db
    .update(teams)
    .set({ claimedBy: null, verifiedAt: null, updatedAt: new Date() })
    .where(and(eq(teams.slug, slug), eq(teams.claimedBy, user.id)));

  revalidatePath(`/teams/${slug}`);
}
