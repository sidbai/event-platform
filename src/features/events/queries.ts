import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { weekendRange } from "@/lib/dates";

export type EventFilters = {
  kind?: string;
  when?: "weekend" | "upcoming" | "past";
  needsOpponent?: boolean;
  q?: string;
};

export async function listEvents(filters: EventFilters = {}) {
  const where: SQL[] = [
    inArray(events.status, ["published", "completed"]),
    // Unlisted and private events are reachable by link/invite, never listed.
    eq(events.visibility, "public"),
  ];

  if (filters.kind) where.push(eq(events.kind, filters.kind));
  if (filters.needsOpponent) where.push(eq(events.needsOpponent, true));
  if (filters.q) {
    where.push(
      or(
        ilike(events.title, `%${filters.q}%`),
        ilike(events.summary, `%${filters.q}%`),
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
    where: (t) => eq(t.claimedBy, userId),
    orderBy: (t) => [asc(t.name)],
    columns: { id: true, name: true },
  });
}
