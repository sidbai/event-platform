import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventFollows, events, venues } from "@/db/schema";

/**
 * Reading who follows what, always in one direction.
 *
 * Every question here is "what does *this* person follow". There is no
 * function for "who follows this event", the same as for teams: a query that
 * answers it is the first step towards a page that shows it.
 */

export async function isFollowingEvent(userId: string, eventId: string): Promise<boolean> {
  const row = await db.query.eventFollows.findFirst({
    where: and(eq(eventFollows.userId, userId), eq(eventFollows.eventId, eventId)),
    columns: { eventId: true },
  });
  return row !== undefined;
}

export type FollowedEvent = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  startsAt: Date | null;
  endsAt: Date | null;
  venueName: string | null;
};

/** The events this person follows, most recently followed first. */
export async function followedEvents(userId: string): Promise<FollowedEvent[]> {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      kind: events.kind,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      venueName: venues.name,
    })
    .from(eventFollows)
    .innerJoin(events, eq(events.id, eventFollows.eventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(eventFollows.userId, userId))
    .orderBy(desc(eventFollows.createdAt));
}
