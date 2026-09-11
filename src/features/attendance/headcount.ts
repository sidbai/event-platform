import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventAttendees } from "@/db/schema";

/**
 * People plus their guests who said going — the one number capacity asks.
 *
 * Its own module, with nothing but the database in it, so the test that
 * checks it counts guests and not maybes can run against a real Postgres
 * without dragging the auth stack along. `queries.ts` next door imports
 * `publicName`, and that imports next-auth, and that does not load outside
 * Next.
 */
export async function countGoing(eventId: string): Promise<{ headcount: number }> {
  const rows = await db.query.eventAttendees.findMany({
    where: and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, "going")),
    columns: { guests: true },
  });
  return { headcount: rows.reduce((n, r) => n + 1 + r.guests, 0) };
}
