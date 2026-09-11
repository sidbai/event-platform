import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";

import { localDate } from "@/features/events/week";

import { db } from "@/db";
import { eventAttendees, eventDivisions, events, matches, teams, venues } from "@/db/schema";
import type { CalendarEntry, CalendarFixture } from "@/features/calendar/ics";
import { timeAnnounced, whereAnnounced } from "@/features/events/kickoff";
import { followedEvents } from "@/features/events/follow-queries";
import { followedTeams } from "@/features/teams/follow-queries";
import { siteUrl } from "@/lib/site-url";

const TZ = "America/Los_Angeles";
/** A fortnight back, so a game just played does not vanish mid-conversation. */
const LOOK_BACK_DAYS = 14;

/**
 * Everything one person would want in their own calendar.
 *
 * The fixtures of the teams they follow, and the events they said they would
 * be at — the same two things the top of their page merges, in the format a
 * phone can subscribe to. After that they never have to open the page at all,
 * which is the right ambition for it.
 */
export async function myCalendar(
  userId: string,
  now = new Date(),
): Promise<(CalendarFixture | CalendarEntry)[]> {
  const since = new Date(now.getTime() - LOOK_BACK_DAYS * 24 * 3_600_000);
  const origin = siteUrl().replace(/\/$/, "");

  const teamIds = (await followedTeams(userId)).map((t) => t.id);

  const [fixtures, attending] = await Promise.all([
    teamIds.length === 0
      ? []
      : db
          .select({
            id: matches.id,
            kickoffAt: matches.kickoffAt,
            field: matches.field,
            venue: matches.venue,
            homeName: teams.name,
            homePlaceholder: matches.homePlaceholder,
            awayPlaceholder: matches.awayPlaceholder,
            awayId: matches.awayTeamId,
            homeId: matches.homeTeamId,
            eventSlug: events.slug,
            eventTitle: events.title,
            division: eventDivisions.name,
          })
          .from(matches)
          .innerJoin(events, eq(events.id, matches.eventId))
          .leftJoin(eventDivisions, eq(eventDivisions.id, matches.divisionId))
          .leftJoin(teams, eq(teams.id, matches.homeTeamId))
          .where(
            and(
              isNotNull(matches.kickoffAt),
              gte(matches.kickoffAt, since),
              or(
                inArray(matches.homeTeamId, teamIds),
                inArray(matches.awayTeamId, teamIds),
              ),
            ),
          )
          .orderBy(asc(matches.kickoffAt)),
    db
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        startsAt: events.startsAt,
            endsAt: events.endsAt,
        venueName: venues.name,
      })
      .from(eventAttendees)
      .innerJoin(events, eq(events.id, eventAttendees.eventId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(eventAttendees.userId, userId),
          isNotNull(events.startsAt),
          gte(events.startsAt, since),
        ),
      ),
  ]);

  /*
   * Both sides of a fixture by name. The home team is joined above; the away
   * one needs its own lookup, and doing it in one pass over the ids beats an
   * aliased join for something this small.
   */
  const otherIds = [
    ...new Set(fixtures.flatMap((f) => [f.homeId, f.awayId]).filter((id): id is string => !!id)),
  ];
  const named = otherIds.length
    ? await db.query.teams.findMany({
        where: inArray(teams.id, otherIds),
        columns: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(named.map((t) => [t.id, t.name]));

  const out: (CalendarFixture | CalendarEntry)[] = fixtures.map((f) => ({
    id: f.id,
    kickoffAt: f.kickoffAt,
    timed: timeAnnounced(f.kickoffAt, TZ),
    home: (f.homeId && nameOf.get(f.homeId)) || f.homePlaceholder || "TBD",
    away: (f.awayId && nameOf.get(f.awayId)) || f.awayPlaceholder || "TBD",
    where: whereAnnounced(f.venue, f.field),
    event: f.eventTitle,
    division: f.division,
    url: `${origin}/events/${f.eventSlug}`,
  }));

  /*
   * A followed event goes in as itself, once. Its fixtures do not: a season
   * is four thousand of them and almost none are this person's — the ones
   * that are come from following the teams.
   */
  /*
   * An event with a real end on the same day is a slot, and its end is the
   * end.
   *
   * Everything else here is drawn an hour long, or across the day when the
   * hour is unknown, because a fixture publishes a kick-off and nothing
   * more. A coach's 2:30–3:30 publishes both, and a phone drawing it until
   * 3:30 rather than 3:30 is the difference between a calendar and a hint.
   * A multi-day end (a tournament's last day at 23:59) is not a slot and
   * keeps the fixture treatment.
   */
  const entryOf = (
    e: { id: string; slug: string; title: string; startsAt: Date | null; endsAt: Date | null; venueName: string | null },
    why: string,
  ): CalendarFixture | CalendarEntry => {
    const slot =
      e.startsAt &&
      e.endsAt &&
      e.endsAt.getTime() > e.startsAt.getTime() &&
      localDate(e.startsAt, TZ) === localDate(e.endsAt, TZ) &&
      timeAnnounced(e.startsAt, TZ);
    if (slot) {
      return {
        id: e.id,
        startsAt: e.startsAt!,
        endsAt: e.endsAt!,
        summary: e.title,
        description: [why, `${origin}/events/${e.slug}`],
        location: e.venueName,
        url: `${origin}/events/${e.slug}`,
      };
    }
    return {
      id: e.id,
      kickoffAt: e.startsAt,
      timed: e.startsAt ? timeAnnounced(e.startsAt, TZ) : false,
      // Not a fixture: one line, the way it reads on the event page.
      home: e.title,
      away: "",
      where: e.venueName,
      event: why,
      division: null,
      url: `${origin}/events/${e.slug}`,
    };
  };

  const said = new Set(attending.map((e) => e.id));
  for (const e of await followedEvents(userId)) {
    if (!e.startsAt || said.has(e.id) || e.startsAt < since) continue;
    out.push(entryOf(e, "You follow this"));
  }

  for (const e of attending) {
    out.push(entryOf(e, "You said you would be there"));
  }

  /*
   * The events this person runs, which are theirs to have on their calendar
   * before anybody RSVPs. A coach who cannot see their own open two o'clock
   * is the problem the training kind exists to fix.
   */
  const seen = new Set(out.map((x) => x.id));
  const organizing = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      venueName: venues.name,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.organizerId, userId),
        inArray(events.status, ["published", "pending"]),
        isNotNull(events.startsAt),
        or(gte(events.endsAt, since), gte(events.startsAt, since)),
      ),
    );
  for (const e of organizing) {
    if (seen.has(e.id)) continue;
    out.push(entryOf(e, "You run this"));
  }

  const when = (x: CalendarFixture | CalendarEntry) =>
    "kickoffAt" in x ? (x.kickoffAt?.getTime() ?? 0) : x.startsAt.getTime();
  return out.sort((a, b) => when(a) - when(b));
}
