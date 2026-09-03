import "server-only";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

export async function listEvents() {
  return db.query.events.findMany({
    where: inArray(events.status, ["published", "completed"]),
    orderBy: [desc(events.startsAt)],
    with: { venue: true },
  });
}

export async function getEventBySlug(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      venue: true,
      divisions: { orderBy: (d) => [asc(d.name)] },
      eventTeams: {
        orderBy: (et) => [desc(et.points), desc(et.gf)],
        with: { team: true, division: true },
      },
      matches: {
        orderBy: (m) => [asc(m.kickoffAt), asc(sql`${m.field}`)],
        with: { homeTeam: true, awayTeam: true, division: true },
      },
    },
  });
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;
