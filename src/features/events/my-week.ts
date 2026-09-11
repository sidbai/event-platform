import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { eventAttendees, events, matches, venues } from "@/db/schema";
import { whereAnnounced } from "@/features/events/kickoff";
import { followedTeams } from "@/features/teams/follow-queries";

import { addDays, zonedInstant } from "./week";

/**
 * One person's week, as a grid: what they run, what they said they would go
 * to, and the games of the teams they follow.
 *
 * The same three things "What is next" lists, laid out by day. The first cut
 * showed only what the person organized, which is a coach's week and nobody
 * else's — a parent who RSVPs to a training session and opens their own page
 * expects Friday to have it. Organizer detail (how many are coming against
 * how many fit) is kept where it applies and left off where it does not.
 */
export type WeekItem = {
  id: string;
  href: string;
  title: string;
  /** Second line: a venue, or the competition a game is in. */
  detail: string | null;
  startsAt: Date;
  endsAt: Date | null;
  role: "organizer" | "attending" | "fixture";
  /** Organizer only: people plus guests who said going, and the room. */
  going?: number;
  capacity?: number | null;
  /** Attending only: what they said. */
  mine?: "going" | "maybe";
  cancelled?: boolean;
};

export async function myWeek(
  userId: string,
  monday: string,
): Promise<WeekItem[]> {
  // Padded a day each side so a late Sunday is not lost to the zone; the grid
  // drops what falls outside.
  const from = zonedInstant(addDays(monday, -1), "00:00");
  const to = zonedInstant(addDays(monday, 8), "00:00");
  const inWindow = and(gte(events.startsAt, from), lt(events.startsAt, to));

  const [organized, attending, followed] = await Promise.all([
    db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        status: events.status,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        venueName: venues.name,
        capacity: events.capacity,
      })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(events.organizerId, userId), inWindow))
      .orderBy(asc(events.startsAt)),
    db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        status: events.status,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        venueName: venues.name,
        mine: eventAttendees.status,
      })
      .from(eventAttendees)
      .innerJoin(events, eq(events.id, eventAttendees.eventId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(eventAttendees.userId, userId), inWindow))
      .orderBy(asc(events.startsAt)),
    followedTeams(userId),
  ]);

  const items: WeekItem[] = [];
  const seen = new Set<string>();

  const going = await headcounts(organized.map((e) => e.id));
  for (const e of organized) {
    if (!e.startsAt) continue;
    seen.add(e.id);
    items.push({
      id: e.id,
      href: `/events/${e.slug}`,
      title: e.title,
      detail: e.venueName,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      role: "organizer",
      going: going.get(e.id) ?? 0,
      capacity: e.capacity,
      cancelled: e.status === "cancelled",
    });
  }

  for (const e of attending) {
    // Running it outranks going to it.
    if (!e.startsAt || seen.has(e.id)) continue;
    seen.add(e.id);
    items.push({
      id: e.id,
      href: `/events/${e.slug}`,
      title: e.title,
      detail: e.venueName,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      role: "attending",
      mine: e.mine,
      cancelled: e.status === "cancelled",
    });
  }

  const teamIds = followed.map((t) => t.id);
  if (teamIds.length > 0) {
    const games = await db.query.matches.findMany({
      where: and(
        isNotNull(matches.kickoffAt),
        gte(matches.kickoffAt, from),
        lt(matches.kickoffAt, to),
        or(
          inArray(matches.homeTeamId, teamIds),
          inArray(matches.awayTeamId, teamIds),
        ),
      ),
      orderBy: asc(matches.kickoffAt),
      columns: { id: true, kickoffAt: true, field: true, venue: true },
      with: {
        event: { columns: { slug: true, title: true } },
        homeTeam: { columns: { name: true } },
        awayTeam: { columns: { name: true } },
      },
    });
    for (const m of games) {
      if (!m.kickoffAt) continue;
      items.push({
        id: `match-${m.id}`,
        href: `/events/${m.event.slug}`,
        title: `${m.homeTeam?.name ?? "TBD"} v ${m.awayTeam?.name ?? "TBD"}`,
        detail: [m.event.title, whereAnnounced(m.venue, m.field)]
          .filter(Boolean)
          .join(" · "),
        startsAt: m.kickoffAt,
        // A youth game is an hour or less; the grid draws an hour when no
        // end is chosen, so none is invented here.
        endsAt: null,
        role: "fixture",
      });
    }
  }

  return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** People plus their guests who said going, per event. */
async function headcounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: eventAttendees.eventId, guests: eventAttendees.guests })
    .from(eventAttendees)
    .where(
      and(
        inArray(eventAttendees.eventId, eventIds),
        eq(eventAttendees.status, "going"),
      ),
    );
  const out = new Map<string, number>();
  for (const r of rows)
    out.set(r.eventId, (out.get(r.eventId) ?? 0) + 1 + r.guests);
  return out;
}
