"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { recordNonDuplicate } from "./non-duplicates";

export type DismissResult = { error?: string; detail?: string };

/**
 * Say two proposed teams are not the same, and mean it next week too.
 *
 * The merge button on these rows is irreversible, so the button beside it has
 * to be worth pressing: without somewhere to write a "no", the same pair is
 * proposed again after every import and the queue never shrinks by reading.
 */
export async function dismissProposal(
  aId: string,
  bId: string,
): Promise<DismissResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (aId === bId) return { error: "That is one team." };

  await recordNonDuplicate(aId, bId, user.id);
  revalidatePath("/admin/teams");
  return { detail: "Noted — these two will not be proposed again." };
}
