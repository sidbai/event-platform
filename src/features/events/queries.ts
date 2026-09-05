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
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { eventKinds, events, venues } from "@/db/schema";
import { weekendRange } from "@/lib/dates";

import { splitByTime } from "./split-by-time";
import { kindEmoji } from "./tags";

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
  /** One event-kind slug, e.g. "pickup". Everything when unset. */
  kind?: string;
};

/**
 * % and _ are wildcards to LIKE, so a search for "50%" would otherwise match
 * anything. Not an injection risk — the value is still parameterised — just
 * wrong matching.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The conditions every public listing of events shares.
 *
 * Shared rather than repeated because the facet counts run a second query over
 * the same rows: if the two drifted, the chips would advertise events the list
 * refuses to show — a hidden or private one — and the count would be the leak.
 */
function visibleEventsWhere(filters: EventFilters): SQL[] {
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

  if (filters.kind) where.push(eq(events.kind, filters.kind));

  const now = new Date();
  if (filters.when === "upcoming") where.push(gte(events.startsAt, now));
  else if (filters.when === "past") where.push(lte(events.startsAt, now));
  else if (filters.when === "weekend") {
    const { start, end } = weekendRange(now);
    where.push(gte(events.startsAt, start), lte(events.startsAt, end));
  }

  return where;
}

export async function listEvents(filters: EventFilters = {}) {
  const where = visibleEventsWhere(filters);

  return db.query.events.findMany({
    where: and(...where),
    orderBy:
      filters.when === "upcoming" || filters.when === "weekend"
        ? [asc(events.startsAt)]
        : [desc(events.startsAt)],
    with: { venue: true, hostTeam: { columns: { name: true } } },
  });
}

/**
 * The event kinds that actually have something to show, with counts.
 *
 * Deliberately counted with the kind filter REMOVED. Counting with it applied
 * would leave one chip reading its own total and every other chip gone, so
 * picking a kind would be a one-way door — you could narrow to Pickup and then
 * have no way to see that there were also three Scrimmages.
 *
 * Kinds with no events are left out entirely: a row of chips that mostly lead
 * to empty pages is worse than a shorter row that always goes somewhere.
 */
export async function listEventKindFacets(filters: EventFilters = {}) {
  const rest: EventFilters = { ...filters, kind: undefined };
  const rows = await db
    .select({ kind: events.kind, n: sql<number>`count(*)::int` })
    .from(events)
    .where(and(...visibleEventsWhere(rest)))
    .groupBy(events.kind);

  const labels = new Map(
    (await db.select({ slug: eventKinds.slug, label: eventKinds.label }).from(eventKinds))
      .map((k) => [k.slug, k.label]),
  );

  return rows
    .map((r) => ({
      slug: r.kind,
      label: labels.get(r.kind) ?? r.kind,
      emoji: kindEmoji(r.kind),
      count: r.n,
    }))
    // Commonest first: the chips are a shortcut to what is actually on, not a
    // taxonomy of everything the site can host.
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
