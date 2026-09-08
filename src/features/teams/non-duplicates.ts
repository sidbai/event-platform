import "server-only";

import { db } from "@/db";
import { teamNonDuplicates } from "@/db/schema";

/**
 * "These two are different teams", remembered.
 *
 * A pair is stored with the smaller id first, so it is one row whichever way
 * round it was offered — the rules might propose A beside B today and B
 * beside A once one of them gains a match and the ordering changes.
 */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function recordNonDuplicate(
  a: string,
  b: string,
  byUserId: string | null,
): Promise<void> {
  const [aTeamId, bTeamId] = pairKey(a, b);
  await db
    .insert(teamNonDuplicates)
    .values({ aTeamId, bTeamId, dismissedBy: byUserId })
    .onConflictDoNothing();
}

/** Every pair somebody has ruled out, as "smaller:larger" keys. */
export async function dismissedPairs(): Promise<Set<string>> {
  const rows = await db
    .select({ a: teamNonDuplicates.aTeamId, b: teamNonDuplicates.bTeamId })
    .from(teamNonDuplicates);
  return new Set(rows.map((r) => `${r.a}:${r.b}`));
}
