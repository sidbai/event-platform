import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  or,
} from "drizzle-orm";

import { db } from "@/db";

import { crestOf } from "./crest";
import { matches, teamFollows, teams } from "@/db/schema";

import { resultFor } from "./record";

/**
 * Reading who follows what — always in one direction.
 *
 * Every question here is "what does *this* person follow". There is no
 * function for "who follows this team", and that is the design rather than an
 * omission: nobody is told, no page counts them, and a query that answers it
 * is the first step towards a page that shows it.
 */

export async function isFollowing(
  userId: string,
  teamId: string,
): Promise<boolean> {
  const row = await db.query.teamFollows.findFirst({
    where: and(eq(teamFollows.userId, userId), eq(teamFollows.teamId, teamId)),
    columns: { teamId: true },
  });
  return row !== undefined;
}

/**
 * Shaped for crestOf, which is the only thing that knows which image stands
 * for a team: its own where it has one, its club's otherwise. Nearly every
 * team here was made by an import and has no crest, and the club almost
 * always does — reading team.crestUrl alone put a grey square beside Seattle
 * Celtic on somebody's own page while Warriors, which happens to have one of
 * its own, looked fine.
 */
export type FollowedTeam = {
  id: string;
  slug: string;
  name: string;
  crestUrl: string | null;
  club: { name: string; crestUrl: string | null } | null;
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
    with: { club: { columns: { name: true, crestUrl: true } } },
  });
  const byId = new Map(found.map((t) => [t.id, t]));

  return rows.flatMap((r) => {
    const team = byId.get(r.teamId);
    return team
      ? [
          {
            id: team.id,
            slug: team.slug,
            name: team.name,
            crestUrl: team.crestUrl ?? null,
            club: team.club
              ? { name: team.club.name, crestUrl: team.club.crestUrl }
              : null,
          },
        ]
      : [];
  });
}

export type NextGame = {
  teamId: string;
  kickoffAt: Date | null;
  eventSlug: string;
  eventTitle: string;
  opponent: { name: string; slug: string } | null;
  /**
   * Both sides as the fixture has them, with a crest each.
   *
   * Beside `opponent` rather than instead of it: the sentence a page builds
   * ("Us v Them") wants home and away in order, and the crests want the
   * club's when the team has none — which is what `crestOf` decides.
   */
  home: { name: string; slug: string; crest: string | null } | null;
  away: { name: string; slug: string; crest: string | null } | null;
  /** "60A #09" — the one thing a parent needs once they are at the ground. */
  field: string | null;
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
export async function nextGames(
  teamIds: string[],
  now = new Date(),
): Promise<NextGame[]> {
  if (teamIds.length === 0) return [];

  const upcoming = await db.query.matches.findMany({
    where: and(
      isNotNull(matches.kickoffAt),
      gte(matches.kickoffAt, now),
      or(
        inArray(matches.homeTeamId, teamIds),
        inArray(matches.awayTeamId, teamIds),
      ),
    ),
    orderBy: asc(matches.kickoffAt),
    columns: { kickoffAt: true, homeTeamId: true, awayTeamId: true, field: true },
    with: {
      event: { columns: { slug: true, title: true } },
      homeTeam: {
        columns: { name: true, slug: true, crestUrl: true },
        with: { club: { columns: { crestUrl: true } } },
      },
      awayTeam: {
        columns: { name: true, slug: true, crestUrl: true },
        with: { club: { columns: { crestUrl: true } } },
      },
    },
  });

  const side = (
    t: {
      name: string;
      slug: string;
      crestUrl: string | null;
      club: { crestUrl: string | null } | null;
    } | null,
  ) => (t ? { name: t.name, slug: t.slug, crest: crestOf(t) } : null);

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
        opponent: opponent
          ? { name: opponent.name, slug: opponent.slug }
          : null,
        home: side(m.homeTeam),
        away: side(m.awayTeam),
        field: m.field,
      });
    }
    if (found.size === wanted.size) break;
  }
  return [...found.values()];
}

export type LastResult = {
  teamId: string;
  kickoffAt: Date | null;
  outcome: "won" | "drawn" | "lost";
  for: number;
  against: number;
  opponent: { name: string; slug: string } | null;
};

/**
 * How each of these teams last got on.
 *
 * The other half of why this list is worth keeping. A next fixture answers
 * "when"; on a Sunday evening the question is "how did it go" — and a parent
 * who was not at the game is exactly the person following the team.
 *
 * Played means scored. A fixture whose date has passed with no score is not a
 * nil-nil, it is a game nobody has entered yet — resultFor already refuses to
 * read it as anything else, and this only has to not ask about it.
 */
export async function lastResults(
  teamIds: string[],
  now = new Date(),
): Promise<LastResult[]> {
  if (teamIds.length === 0) return [];

  const played = await db.query.matches.findMany({
    where: and(
      isNotNull(matches.homeScore),
      isNotNull(matches.awayScore),
      isNotNull(matches.kickoffAt),
      lt(matches.kickoffAt, now),
      or(
        inArray(matches.homeTeamId, teamIds),
        inArray(matches.awayTeamId, teamIds),
      ),
    ),
    orderBy: desc(matches.kickoffAt),
    columns: {
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
    with: {
      homeTeam: { columns: { name: true, slug: true } },
      awayTeam: { columns: { name: true, slug: true } },
    },
  });

  // Newest first already, so the first one seen for a team is its last.
  const wanted = new Set(teamIds);
  const found = new Map<string, LastResult>();
  for (const m of played) {
    for (const [id, opponent] of [
      [m.homeTeamId, m.awayTeam],
      [m.awayTeamId, m.homeTeam],
    ] as const) {
      if (!id || !wanted.has(id) || found.has(id)) continue;
      /*
       * The one place that decides what a scoreline meant for a side, shared
       * with the record and the form guide so the three cannot disagree.
       */
      const result = resultFor(m, id);
      if (!result) continue;
      found.set(id, {
        teamId: id,
        kickoffAt: m.kickoffAt,
        outcome: result.outcome,
        for: result.for,
        against: result.against,
        opponent: opponent
          ? { name: opponent.name, slug: opponent.slug }
          : null,
      });
    }
    if (found.size === wanted.size) break;
  }
  return [...found.values()];
}
