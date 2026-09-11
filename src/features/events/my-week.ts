import "server-only";

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { eventAttendees, events, venues } from "@/db/schema";

import { addDays, zonedInstant } from "./week";

/**
 * The week of somebody who runs events, as a grid rather than a list.
 *
 * Written for a coach with three Sunday slots, but nothing here knows what a
 * coach is: it is every event this person organizes that starts in the
 * week, with how many said they are coming against how many fit. Only the
 * organizer sees it, on their own page, because it is their week and nobody
 * else's.
 */
export type WeekEvent = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  status: "draft" | "pending" | "published" | "cancelled" | "completed";
  startsAt: Date;
  endsAt: Date | null;
  venueName: string | null;
  capacity: number | null;
  /** People plus their guests who said going. */
  going: number;
};

export async function myWeek(userId: string, monday: string): Promise<WeekEvent[]> {
  // Padded a day each side so a late Sunday is not lost to the zone; the grid
  // drops what falls outside.
  const from = zonedInstant(addDays(monday, -1), "00:00");
  const to = zonedInstant(addDays(monday, 8), "00:00");

  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      kind: events.kind,
      status: events.status,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      venueName: venues.name,
      capacity: events.capacity,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(eq(events.organizerId, userId), gte(events.startsAt, from), lt(events.startsAt, to)),
    )
    .orderBy(asc(events.startsAt));

  const withStart = rows.filter((r): r is typeof r & { startsAt: Date } => r.startsAt !== null);
  if (withStart.length === 0) return [];

  const going = await db
    .select({ eventId: eventAttendees.eventId, guests: eventAttendees.guests })
    .from(eventAttendees)
    .where(
      and(
        inArray(
          eventAttendees.eventId,
          withStart.map((r) => r.id),
        ),
        eq(eventAttendees.status, "going"),
      ),
    );
  const heads = new Map<string, number>();
  for (const g of going) heads.set(g.eventId, (heads.get(g.eventId) ?? 0) + 1 + g.guests);

  return withStart.map((r) => ({ ...r, going: heads.get(r.id) ?? 0 }));
}

/** Whether this person has anything to draw a week for, cheaply. */
export async function organizesAnything(userId: string): Promise<boolean> {
  const row = await db.query.events.findFirst({
    where: eq(events.organizerId, userId),
    columns: { id: true },
  });
  return Boolean(row);
}
