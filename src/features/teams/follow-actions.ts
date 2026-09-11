"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamFollows, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";

/**
 * Follow a team, or stop.
 *
 * A toggle rather than two calls, so a double click cannot leave a stray row —
 * the primary key means the state is simply present or not.
 *
 * The team is looked up by slug here rather than taking an id from the page,
 * because a page that hands an id up is a page whose id can be swapped for
 * another. Following the wrong team is harmless, but the habit is not.
 */
export async function toggleFollow(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const gate = await checkRateLimit("follow:toggle", user);
  if (!gate.ok) return;

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    columns: { id: true },
  });
  if (!team) return;

  const where = and(eq(teamFollows.userId, user.id), eq(teamFollows.teamId, team.id));
  const existing = await db.query.teamFollows.findFirst({
    where,
    columns: { teamId: true },
  });

  if (existing) {
    await db.delete(teamFollows).where(where);
  } else {
    await db
      .insert(teamFollows)
      .values({ teamId: team.id, userId: user.id })
      // Two clicks racing each other: the row is already what it should be.
      .onConflictDoNothing();
  }

  revalidatePath(`/teams/${slug}`);
  revalidatePath("/following");
}
