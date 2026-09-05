import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { events, venues } from "@/db/schema";
import { weekendRange } from "@/lib/dates";

import { splitByTime } from "./split-by-time";

export type EventFilters = {
  /** Free text across the title, summary and where it is being played. */
  q?: string;
  /**
   * Time window. The events page leaves this off while searching — if you
   * typed something you want it whether it has happened or not — and pins it
   * to "upcoming" when the box is empty, or a browse with no window would be
   * dominated by everything that already happened.
   */
  when?: "weekend" | "upcoming" | "past";
};

/**
 * % and _ are wildcards to LIKE, so a search for "50%" would otherwise match
 * anything. Not an injection risk — the value is still parameterised — just
 * wrong matching.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listEvents(filters: EventFilters = {}) {
  const where: SQL[] = [
    inArray(events.status, ["published", "completed"]),
    // Unlisted and private events are reachable by link/invite, never listed.
    eq(events.visibility, "public"),
    // A banned event is off every list, whatever its visibility says.
    isNull(events.hiddenAt),
  ];

  if (filters.q) {
    const term = `%${escapeLike(filters.q)}%`;
    where.push(
      or(
        ilike(events.title, term),
        ilike(events.summary, term),
        // Venue comes through a relation, which cannot filter the parent, so
        // matching where it is played needs a subquery on the id.
        inArray(
          events.venueId,
          db
            .select({ id: venues.id })
            .from(venues)
            .where(or(ilike(venues.name, term), ilike(venues.city, term))),
        ),
      )!,
    );
  }

  const now = new Date();
  if (filters.when === "upcoming") where.push(gte(events.startsAt, now));
  else if (filters.when === "past") where.push(lte(events.startsAt, now));
  else if (filters.when === "weekend") {
    const { start, end } = weekendRange(now);
    where.push(gte(events.startsAt, start), lte(events.startsAt, end));
  }

  return db.query.events.findMany({
    where: and(...where),
    orderBy:
      filters.when === "upcoming" || filters.when === "weekend"
        ? [asc(events.startsAt)]
        : [desc(events.startsAt)],
    with: { venue: true, hostTeam: { columns: { name: true } } },
  });
}

/** listEvents, already split into upcoming and past for the events page. */
export async function listEventsByTime(filters: EventFilters = {}) {
  const events = await listEvents(filters);
  return { ...splitByTime(events, new Date()), total: events.length };
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
        orderBy: (m) => [asc(m.kickoffAt), asc(m.field)],
        with: { homeTeam: true, awayTeam: true, division: true },
      },
    },
  });
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;

export async function getEventOffers(eventId: string) {
  return db.query.eventOffers.findMany({
    where: (o) => eq(o.eventId, eventId),
    orderBy: (o) => [desc(o.createdAt)],
    with: { fromTeam: { columns: { name: true, slug: true } } },
  });
}

export async function teamsManagedBy(userId: string) {
  return db.query.teams.findMany({
    where: (t) => eq(t.ownerId, userId),
    orderBy: (t) => [asc(t.name)],
    columns: { id: true, name: true },
  });
}
