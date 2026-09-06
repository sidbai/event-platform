import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { teams } from "@/db/schema";

/**
 * A team slug nobody else is using.
 *
 * Three copies of this loop had grown — one for the create form, one for the
 * organizer adding a team on the scores page, and a third wanted by entering a
 * team straight from an event. They had already drifted on how many tries they
 * made and what they fell back to, which is the shape of bug that eventually
 * lets two teams claim one URL.
 *
 * Not in create-actions.ts, which is a "use server" module: everything
 * exported from one of those has to be an async action, so a shared helper has
 * nowhere to live there.
 */
export async function uniqueTeamSlug(base: string): Promise<string> {
  const root = base || "team";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.teams.findFirst({
      where: eq(teams.slug, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
  // Fifty names taken is not a collision any more, it is a pattern — so stop
  // guessing and take one nobody will hit.
  return `${root}-${Date.now()}`;
}
