import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

export async function getEventForScoring(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      divisions: { orderBy: (d) => [asc(d.name)] },
      eventTeams: {
        with: {
          team: { columns: { id: true, name: true } },
          division: { columns: { id: true, name: true } },
        },
      },
      matches: {
        orderBy: (m) => [asc(m.kickoffAt), asc(m.field)],
        with: {
          homeTeam: { columns: { id: true, name: true } },
          awayTeam: { columns: { id: true, name: true } },
          division: { columns: { id: true, name: true } },
        },
      },
    },
  });
}

export type ScoringEvent = NonNullable<
  Awaited<ReturnType<typeof getEventForScoring>>
>;
