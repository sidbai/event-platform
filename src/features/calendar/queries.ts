import "server-only";

import { aliasedTable, and, asc, eq, gte, isNotNull, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { eventDivisions, events, matches, teams } from "@/db/schema";
import { timeAnnounced, whereAnnounced } from "@/features/events/kickoff";
import { siteUrl } from "@/lib/site-url";

import type { CalendarFixture } from "./ics";

/**
 * The fixtures behind a feed.
 *
 * Everything still to come, and a fortnight behind. A calendar people
 * subscribe to is read forward — last season's results belong on the page —
 * and the fortnight is there so a game just played does not vanish off
 * somebody's week while they are still talking about it.
 */
const LOOK_BACK_DAYS = 14;

const home = aliasedTable(teams, "home_team");
const away = aliasedTable(teams, "away_team");

/**
 * Built with the query builder rather than as SQL.
 *
 * The first version wrote the join by hand and passed the caller's clause
 * into it, which put "matches"."home_team_id" inside a statement that had
 * aliased the table to m — a 500 on every request, and the kind of seam that
 * only shows up when both halves are written by different hands.
 */
async function fixturesWhere(clause: SQL | undefined): Promise<CalendarFixture[]> {
  const since = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 3_600_000);

  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      field: matches.field,
      venue: matches.venue,
      homePlaceholder: matches.homePlaceholder,
      awayPlaceholder: matches.awayPlaceholder,
      eventSlug: events.slug,
      eventTitle: events.title,
      timezone: events.timezone,
      division: eventDivisions.name,
      homeName: home.name,
      awayName: away.name,
    })
    .from(matches)
    .innerJoin(events, eq(events.id, matches.eventId))
    .leftJoin(eventDivisions, eq(eventDivisions.id, matches.divisionId))
    .leftJoin(home, eq(home.id, matches.homeTeamId))
    .leftJoin(away, eq(away.id, matches.awayTeamId))
    .where(and(isNotNull(matches.kickoffAt), gte(matches.kickoffAt, since), clause))
    .orderBy(asc(matches.kickoffAt));

  const origin = siteUrl().replace(/\/$/, "");
  return rows.map((row) => {
    const zone = row.timezone ?? "America/Los_Angeles";
    return {
      id: row.id,
      kickoffAt: row.kickoffAt,
      timed: timeAnnounced(row.kickoffAt, zone),
      // A knockout names what it is waiting for, and that is worth putting in
      // a calendar as much as a team is.
      home: row.homeName ?? row.homePlaceholder ?? "TBD",
      away: row.awayName ?? row.awayPlaceholder ?? "TBD",
      where: whereAnnounced(row.venue, row.field),
      event: row.eventTitle,
      division: row.division,
      url: `${origin}/events/${row.eventSlug}`,
    };
  });
}

/** One team's fixtures, home and away. */
export function teamFixtures(teamId: string) {
  return fixturesWhere(
    or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
  );
}

/** One event's fixtures. */
export function eventFixtures(eventId: string) {
  return fixturesWhere(eq(matches.eventId, eventId));
}
