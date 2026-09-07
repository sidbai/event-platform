import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { clubAliases, teams } from "@/db/schema";

import { aliasKey } from "./matching";

/**
 * File teams under a club and remember the name that matched.
 *
 * Separate from the action so it can be tested against a real database: the
 * CHECK constraint binding affiliation to club_id is the thing most worth
 * proving, and it only exists in Postgres.
 */
export async function linkTeamsToClub(
  clubId: string,
  key: string,
  teamIds: string[],
  byUserId: string | null,
): Promise<{ linked: number; alias: string | null }> {
  if (teamIds.length === 0) return { linked: 0, alias: null };
  const alias = aliasKey(key) || null;

  await db.transaction(async (tx) => {
    await tx
      .update(teams)
      .set({ clubId, affiliation: "club", updatedAt: new Date() })
      .where(inArray(teams.id, teamIds));

    if (alias) {
      // Re-pointing an existing alias is a correction rather than a clash:
      // the admin looking at it now has seen more than the one who set it.
      await tx
        .insert(clubAliases)
        .values({ alias, clubId, createdBy: byUserId })
        .onConflictDoUpdate({
          target: clubAliases.alias,
          set: { clubId, createdBy: byUserId },
        });
    }
  });

  return { linked: teamIds.length, alias };
}

/**
 * Record that teams belong to no club.
 *
 * Clears club_id in the same statement, because the constraint refuses the
 * halfway state — which is the point of having it.
 */
export async function setIndependent(teamIds: string[]): Promise<number> {
  if (teamIds.length === 0) return 0;
  await db
    .update(teams)
    .set({ affiliation: "independent", clubId: null, updatedAt: new Date() })
    .where(inArray(teams.id, teamIds));
  return teamIds.length;
}
