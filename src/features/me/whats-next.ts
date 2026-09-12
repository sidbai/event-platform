import "server-only";

import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { eventAttendees, events, teams, venues } from "@/db/schema";
import { timeAnnounced } from "@/features/events/kickoff";
import { nextGames } from "@/features/teams/follow-queries";

/**
 * The next things, whatever kind of thing they are.
 *
 * A parent does not hold two lists in their head — one of their child's
 * fixtures and one of the sessions they said they would be at. They hold
 * "Saturday, and what time". So the two are merged and sorted by when, and
 * what each one *is* becomes a label rather than a heading.
 */

export type Upcoming = {
  kind: "fixture" | "event";
  at: Date;
  /** Whether the hour is known, or only the day. */
  timed: boolean;
  title: string;
  detail: string | null;
  href: string;
  /** A fixture: both sides, home then away, and which of them this person follows. */
  sides?: {
    home: { name: string; crest: string | null; followed: boolean } | null;
    away: { name: string; crest: string | null; followed: boolean } | null;
  };
  /** A fixture: the ground and the pitch, whichever the schedule names. */
  where?: string | null;
  /** An event: its logo, or the kind's icon when it has none. */
  logo?: { src: string | null; kind: string };
};

/**
 * The zone everything here is played in.
 *
 * Passed to timeAnnounced rather than compared against a UTC hour, which is
 * right for half a year and off by one for the other half.
 */
const TZ = "America/Los_Angeles";

export async function whatsNext(
  userId: string,
  teamIds: string[],
  now = new Date(),
): Promise<Upcoming[]> {
  const [fixtures, attending] = await Promise.all([
    nextGames(teamIds, now),
    /*
     * Events this person said they would be at. "Maybe" counts: somebody who
     * has not decided still wants to see it coming, and leaving it out would
     * make the list quietly wrong for the case it was added for.
     */
    db
      .select({
        title: events.title,
        slug: events.slug,
        kind: events.kind,
        logoUrl: events.logoUrl,
        startsAt: events.startsAt,
        venueName: venues.name,
        status: eventAttendees.status,
      })
      .from(eventAttendees)
      .innerJoin(events, eq(events.id, eventAttendees.eventId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(eventAttendees.userId, userId),
          isNotNull(events.startsAt),
          gte(events.startsAt, now),
        ),
      )
      .orderBy(asc(events.startsAt)),
  ]);

  const named =
    teamIds.length > 0
      ? await db.query.teams.findMany({
          where: inArray(teams.id, teamIds),
          columns: { id: true, name: true, slug: true },
        })
      : [];
  const teamById = new Map(named.map((t) => [t.id, t]));
  const followedSlugs = new Set(named.map((t) => t.slug));

  const out: Upcoming[] = [];

  for (const game of fixtures) {
    const team = teamById.get(game.teamId);
    if (!team || !game.kickoffAt) continue;
    out.push({
      kind: "fixture",
      at: game.kickoffAt,
      // Midnight local is how this codebase says "day known, hour not".
      timed: timeAnnounced(game.kickoffAt, TZ),
      // Home first, as the fixture reads; the followed team may be either.
      title:
        game.home && game.away
          ? `${game.home.name} v ${game.away.name}`
          : game.opponent
            ? `${team.name} v ${game.opponent.name}`
            : team.name,
      detail: game.eventTitle,
      href: `/teams/${team.slug}`,
      sides: {
        home: game.home && {
          ...game.home,
          followed: followedSlugs.has(game.home.slug),
        },
        away: game.away && {
          ...game.away,
          followed: followedSlugs.has(game.away.slug),
        },
      },
      where: game.where,
    });
  }

  /*
   * Events this person is going to. Not the ones they merely follow: those
   * used to be here too, and a followed league's opening day sat at the top
   * of the list for a fortnight saying nothing a parent could act on. The
   * sidebar lists what you follow; this lists what you will be at.
   */
  for (const event of attending) {
    if (!event.startsAt) continue;
    out.push({
      kind: "event",
      at: event.startsAt,
      timed: timeAnnounced(event.startsAt, TZ),
      title: event.title,
      detail:
        [event.venueName, event.status === "maybe" ? "you said maybe" : null]
          .filter(Boolean)
          .join(" · ") || null,
      href: `/events/${event.slug}`,
      logo: { src: event.logoUrl, kind: event.kind },
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
