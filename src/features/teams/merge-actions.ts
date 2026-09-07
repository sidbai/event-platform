"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { mergeTeams } from "./merge";

export type MergeActionResult = { error?: string; detail?: string };

/**
 * Fold a group of duplicate rows into one, on somebody's say-so.
 *
 * Admin only, and deliberately never automatic. Two rows sharing a name is
 * strong evidence inside one club's own tournaments and none at all across a
 * region where every club has a Warriors — and a merge cannot be undone, so
 * the last step is a person looking at the two names.
 */
export async function confirmMerge(
  survivorId: string,
  loserIds: string[],
  // useActionState hands the previous state in; this action takes everything
  // it needs from its bound arguments and has no use for it.
): Promise<MergeActionResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };

  try {
    // The admin's id rides along: an alias binds every future import of that
    // name, so who said so is worth keeping.
    const out = await mergeTeams(survivorId, loserIds, user.id);
    revalidatePath("/admin/teams");
    revalidatePath(`/teams/${out.survivorSlug}`);
    return {
      detail:
        `Merged ${out.merged} into ${out.survivorSlug} — ` +
        `${out.matchesMoved} matches and ${out.entriesMoved} entries moved` +
        (out.entriesDropped > 0
          ? `, ${out.entriesDropped} duplicate entr${out.entriesDropped === 1 ? "y" : "ies"} dropped`
          : ""),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Merge failed." };
  }
}
