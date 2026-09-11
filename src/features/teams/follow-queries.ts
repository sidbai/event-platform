import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/db";
import { matches, teamFollows, teams } from "@/db/schema";

/**
 * Reading who follows what — always in one direction.
 *
 * Every question here is "what does *this* person follow". There is no
 * function for "who follows this team", and that is the design rather than an
 * omission: nobody is told, no page counts them, and a query that answers it
 * is the first step towards a page that shows it.
 */

export async function isFollowing(userId: string, teamId: string): Promise<boolean> {
  const row = await db.query.teamFollows.findFirst({
    where: and(eq(teamFollows.userId, userId), eq(teamFollows.teamId, teamId)),
    columns: { teamId: true },
  });
  return row !== undefined;
}

export type FollowedTeam = {
  id: string;
  slug: string;
  name: string;
  crestUrl: string | null;
  clubName: string | null;
};

/** The teams this person follows, most recently followed first. */
export async function followedTeams(userId: string): Promise<FollowedTeam[]> {
  const rows = await db
    .select({ teamId: teamFollows.teamId, at: teamFollows.createdAt })
    .from(teamFollows)
    .where(eq(teamFollows.userId, userId))
    .orderBy(desc(teamFollows.createdAt));
  if (rows.length === 0) return [];

  /*
   * Two queries rather than a join, because the order comes from the follow
   * and the rest comes from the team. Keeping them apart means the order is
   * decided in one place and cannot be quietly lost to a join's own.
   */
  const found = await db.query.teams.findMany({
    where: inArray(
      teams.id,
      rows.map((r) => r.teamId),
    ),
    columns: { id: true, slug: true, name: true, crestUrl: true },
    with: { club: { columns: { name: true } } },
  });
  const byId = new Map(found.map((t) => [t.id, t]));

  return rows.flatMap((r) => {
    const team = byId.get(r.teamId);
    return team
      ? [{ ...team, crestUrl: team.crestUrl ?? null, clubName: team.club?.name ?? null }]
      : [];
  });
}

export type NextGame = {
  teamId: string;
  kickoffAt: Date | null;
  eventSlug: string;
  eventTitle: string;
  opponent: { name: string; slug: string } | null;
};

/**
 * When each of these teams next plays.
 *
 * Read with the query builder rather than as SQL: this takes a list of ids
 * from the caller, and hand-written SQL is where a list of ids stops being
 * data and starts being part of the statement. There is no shortage of ways
 * to bind an array safely; there is no good reason to interpolate one.
 *
 * A fixture with no kickoff time is not "next". Most of a league's season is
 * published before the fields are booked, and a row with no time cannot be
 * ordered against one that has it — it appears on the team's own page, where
 * the whole list is in date order and a missing time reads as what it is.
 */
export async function nextGames(teamIds: string[], now = new Date()): Promise<NextGame[]> {
  if (teamIds.length === 0) return [];

  const upcoming = await db.query.matches.findMany({
    where: and(
      isNotNull(matches.kickoffAt),
      gte(matches.kickoffAt, now),
      or(inArray(matches.homeTeamId, teamIds), inArray(matches.awayTeamId, teamIds)),
    ),
    orderBy: asc(matches.kickoffAt),
    columns: { kickoffAt: true, homeTeamId: true, awayTeamId: true },
    with: {
      event: { columns: { slug: true, title: true } },
      homeTeam: { columns: { name: true, slug: true } },
      awayTeam: { columns: { name: true, slug: true } },
    },
  });

  // In kickoff order already, so the first one seen for a team is its next.
  const wanted = new Set(teamIds);
  const found = new Map<string, NextGame>();
  for (const m of upcoming) {
    for (const [id, opponent] of [
      [m.homeTeamId, m.awayTeam],
      [m.awayTeamId, m.homeTeam],
    ] as const) {
      if (!id || !wanted.has(id) || found.has(id)) continue;
      found.set(id, {
        teamId: id,
        kickoffAt: m.kickoffAt,
        eventSlug: m.event.slug,
        eventTitle: m.event.title,
        opponent: opponent ? { name: opponent.name, slug: opponent.slug } : null,
      });
    }
    if (found.size === wanted.size) break;
  }
  return [...found.values()];
}
