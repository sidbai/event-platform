import "server-only";

import { and, eq, ilike, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { clubs, teams } from "@/db/schema";

/**
 * Filing teams under a club by the name they go by.
 *
 * The queue offers a team three answers: this club, no club, or nothing yet.
 * Two of them can be changed later from the queue itself; "no club" cannot,
 * because the queue only lists teams nobody has answered for. So a group
 * marked independent before its club existed — 32 Sparta Tacoma sides, on the
 * day the club was still missing from the directory — disappears from the one
 * screen that could put it right.
 *
 * The page says as much where the button is: marking a club team independent
 * is the one answer that is hard to notice later. This is the way back.
 */

export type FilePlan = {
  club: { id: string; name: string; slug: string };
  teams: { id: string; name: string; affiliation: string }[];
};

/**
 * The teams a pattern finds that this club does not already hold. Reads only.
 *
 * Both 'independent' and 'unknown' are in scope: the first is the answer being
 * taken back, the second is one nobody has given yet. A team already filed
 * under another club is not — moving those is what a club merge is for, and
 * doing it silently here would take a decision somebody made and undo it
 * without saying so.
 */
export async function planFile(
  clubSlug: string,
  like: string,
): Promise<FilePlan | { error: string }> {
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, clubSlug),
    columns: { id: true, name: true, slug: true },
  });
  if (!club) return { error: `No club with slug "${clubSlug}".` };

  const rows = await db
    .select({ id: teams.id, name: teams.name, affiliation: teams.affiliation })
    .from(teams)
    .where(
      and(
        ilike(teams.name, like),
        or(eq(teams.affiliation, "independent"), eq(teams.affiliation, "unknown")),
        // Already this club's is not a change; another club's is not ours.
        ne(teams.affiliation, "club"),
      ),
    )
    .orderBy(teams.name);

  return { club, teams: rows };
}
