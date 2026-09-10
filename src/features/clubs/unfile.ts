import "server-only";

import { and, eq, ilike, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, eventTeams, teams } from "@/db/schema";

/**
 * Taking back teams that were filed under the wrong club.
 *
 * The matcher's guesses are confirmed by a person, so a wrong one is rare —
 * but "lake" reached only Lake Washington Premier FC, so Lake Chelan FC and
 * Lake Hills SC went under it, and the canonical rename then wrote that
 * club's name over their own. Both halves have to come back: clearing the
 * affiliation alone leaves fifteen teams still *called* Lake Washington
 * Premier FC.
 *
 * What a team was imported as is on its event entry, and that is the only
 * record of the name it had before. Where there is none, this says so rather
 * than inventing one — the rename removed words, it did not keep them, so
 * anything reconstructed here would be a guess wearing a fact's clothes.
 */

export type UnfilePlan = {
  club: { id: string; name: string };
  teams: {
    id: string;
    slug: string;
    name: string;
    /** The name it was imported under, or null when nothing recorded one. */
    restored: string | null;
    /** Whether the crest it wears is the club's rather than its own. */
    inheritedCrest: boolean;
  }[];
};

/**
 * What taking these teams back would do. Reads only.
 *
 * `like` is matched against the team's current name — which is the renamed
 * one, since that is what an admin is looking at when they notice.
 */
export async function planUnfile(
  clubSlug: string,
  like: string,
): Promise<UnfilePlan | null> {
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, clubSlug),
    columns: { id: true, name: true },
  });
  if (!club) return null;

  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      crestUrl: teams.crestUrl,
      // Any entry that kept one; a team imported twice was imported under the
      // same name both times, or the duplicate finder would have split it.
      restored: sql<string | null>`min(${eventTeams.sourceName})`,
    })
    .from(teams)
    .leftJoin(
      eventTeams,
      and(eq(eventTeams.teamId, teams.id), isNotNull(eventTeams.sourceName)),
    )
    .where(and(eq(teams.clubId, club.id), ilike(teams.name, like)))
    .groupBy(teams.id)
    .orderBy(teams.name);

  return {
    club,
    teams: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      // A name it already has is not a restoration.
      restored: r.restored && r.restored !== r.name ? r.restored : null,
      inheritedCrest: (r.crestUrl ?? "").includes("/clubs/"),
    })),
  };
}

/**
 * Put them back to unplaced, with the names they were imported under.
 *
 * Back to 'unknown' rather than 'independent': these teams do belong to a
 * club, it is one the directory has never had, and 'independent' is the
 * answer that stops the queue ever asking again.
 *
 * A crest uploaded for the team is left alone — only one taken from the club
 * is cleared, told apart by where the file lives, the same way the backfill
 * tells them apart.
 */
export async function unfileTeams(plan: UnfilePlan): Promise<number> {
  if (plan.teams.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const team of plan.teams) {
      await tx
        .update(teams)
        .set({
          clubId: null,
          affiliation: "unknown",
          ...(team.restored ? { name: team.restored } : {}),
          ...(team.inheritedCrest ? { crestUrl: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(teams.id, team.id));
    }
  });

  return plan.teams.length;
}
