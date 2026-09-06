import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

/**
 * Everything a league table and schedule need, in one read.
 *
 * The same shape as the scoring query, minus what only an organizer entering
 * results cares about. Kept separate rather than reused because the public
 * page must never quietly grow a field that only made sense behind the
 * organizer's login.
 */
export async function getLeague(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      kind: true,
      status: true,
      visibility: true,
      hiddenAt: true,
      timezone: true,
      // Needed by canViewEvent, which decides whether a private league is
      // visible to this reader at all.
      organizerId: true,
      hostTeamId: true,
    },
    with: {
      divisions: { orderBy: (d) => [asc(d.name)] },
      eventTeams: {
        with: {
          team: { columns: { id: true, name: true, slug: true } },
        },
      },
      matches: {
        orderBy: (m) => [asc(m.kickoffAt), asc(m.field)],
        with: {
          homeTeam: { columns: { id: true, name: true } },
          awayTeam: { columns: { id: true, name: true } },
        },
      },
      venue: { columns: { name: true } },
    },
  });
}

export type League = NonNullable<Awaited<ReturnType<typeof getLeague>>>;
