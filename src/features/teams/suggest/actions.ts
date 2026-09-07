"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamMatchSuggestions } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { mergeTeams } from "@/features/teams/merge";

export type SuggestionResult = { error?: string; detail?: string };

/**
 * Take a model's suggestion, which runs the merge an admin would have run.
 *
 * Accepting is the only thing that changes data, and it does exactly what
 * the hand-driven queue does — including writing the alias, so the next
 * import binds without asking anybody, model or person.
 */
export async function acceptSuggestion(id: string): Promise<SuggestionResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  const row = await db.query.teamMatchSuggestions.findFirst({
    where: eq(teamMatchSuggestions.id, id),
  });
  if (!row) return { error: "That suggestion is gone." };

  try {
    // The older row survives: it carries the history the new one is joining.
    const out = await mergeTeams(row.existingTeamId, [row.newTeamId], user.id);
    await db
      .update(teamMatchSuggestions)
      .set({ acceptedAt: new Date() })
      .where(eq(teamMatchSuggestions.id, id));
    revalidatePath("/admin/teams");
    return {
      detail: `Merged into ${out.survivorSlug} — ${out.matchesMoved} matches moved.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Merge failed." };
  }
}

/**
 * Say no, and remember it.
 *
 * Dismissed rather than deleted: the next run would otherwise suggest the
 * same pair, and the count of these against the accepted ones is the only
 * honest way to judge whether the model is worth its keep.
 */
export async function dismissSuggestion(id: string): Promise<SuggestionResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  await db
    .update(teamMatchSuggestions)
    .set({ dismissedAt: new Date() })
    .where(eq(teamMatchSuggestions.id, id));
  revalidatePath("/admin/teams");
  return { detail: "Dismissed." };
}
