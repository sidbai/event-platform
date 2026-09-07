import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { events, matches, teamMembers, teams } from "@/db/schema";

/**
 * Teams anyone may see listed.
 *
 * `visibility` carries two meanings — see view-decision.ts — and this is the
 * listing half. A team created for a tournament is 'private' only in the
 * sense of "we did not put it here on purpose"; its name is already on public
 * standings pages, so hiding it from a directory while linking it from a
 * schedule protected nothing and left the page empty. A team a person created
 * and marked private stays out, because that one was a promise.
 */
const listable = or(eq(teams.visibility, "public"), isNotNull(teams.originEventId));

export type TeamFilter = {
  q?: string;
  /** 'club' or 'independent'; anything else means no filter. */
  affiliation?: string;
  window?: { limit: number; offset: number };
};

/** % and _ are LIKE wildcards; a search for "50%" must not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The team directory: what the /teams page lists, searches and pages. */
export async function listTeams(filter: TeamFilter = {}) {
  const term = filter.q?.trim() ? `%${escapeLike(filter.q.trim())}%` : null;
  const affiliation =
    filter.affiliation === "club" || filter.affiliation === "independent"
      ? filter.affiliation
      : null;

  const where = and(
    listable,
    term ? or(ilike(teams.name, term), ilike(teams.city, term)) : undefined,
    affiliation ? eq(teams.affiliation, affiliation) : undefined,
  );

  // Counted before slicing, so the pager sizes the whole result.
  const total = await db.$count(teams, where);
  const rows = await db.query.teams.findMany({
    where,
    orderBy: [asc(teams.name)],
    limit: filter.window?.limit,
    offset: filter.window?.offset,
    with: {
      eventTeams: { columns: { eventId: true } },
      club: { columns: { slug: true, name: true, crestUrl: true } },
    },
  });
  return { rows, total };
}

/**
 * How many teams sit in each category, for the filter chips.
 *
 * Counted within the search rather than across everything: a chip reading
 * "All 939" beside a list of two results describes a page nobody is looking
 * at, and invites a click that appears to lose the search.
 */
export async function teamCounts(q?: string): Promise<{
  all: number;
  club: number;
  independent: number;
}> {
  const term = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
  const matching = and(
    listable,
    term ? or(ilike(teams.name, term), ilike(teams.city, term)) : undefined,
  );
  const [all, club, independent] = await Promise.all([
    db.$count(teams, matching),
    db.$count(teams, and(matching, eq(teams.affiliation, "club"))),
    db.$count(teams, and(matching, eq(teams.affiliation, "independent"))),
  ]);
  return { all, club, independent };
}

export async function getTeamBySlug(slug: string) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    with: {
      originEvent: { columns: { slug: true, title: true } },
      members: {
        with: {
          user: {
            columns: {
              name: true,
              displayName: true,
              username: true,
              email: true,
              image: true,
            },
          },
        },
      },
      eventTeams: { with: { event: true, division: true } },
      club: { columns: { slug: true, name: true } },
    },
  });
  if (!team) return null;

  /*
   * Newest tournament first, the way a history reads. This was ordered by
   * points, which is zero for every team a connector created — so the order
   * was whatever the database felt like returning. Sorted here rather than in
   * the query because the date lives on the event, and a relational `with`
   * cannot order a relation by its own relation's column.
   */
  team.eventTeams.sort(
    (a, b) => (b.event.startsAt?.getTime() ?? 0) - (a.event.startsAt?.getTime() ?? 0),
  );

  const playedMatches = await db.query.matches.findMany({
    where: or(eq(matches.homeTeamId, team.id), eq(matches.awayTeamId, team.id)),
    orderBy: [desc(matches.kickoffAt)],
    with: {
      event: { columns: { slug: true, title: true } },
      division: { columns: { name: true } },
      homeTeam: { columns: { name: true, slug: true, crestUrl: true } },
      awayTeam: { columns: { name: true, slug: true, crestUrl: true } },
    },
  });

  return { ...team, matches: playedMatches };
}

export type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeamBySlug>>>;

/**
 * Events this team hosts. Private ones are only included for members — the
 * whole point of a private team event is that outsiders can't see it.
 */
export async function hostedEvents(teamId: string, includePrivate: boolean) {
  return db.query.events.findMany({
    where: includePrivate
      ? eq(events.hostTeamId, teamId)
      : and(
          eq(events.hostTeamId, teamId),
          eq(events.visibility, "public"),
          isNull(events.hiddenAt),
        ),
    orderBy: [desc(events.startsAt)],
    limit: 20,
    columns: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      startsAt: true,
      visibility: true,
    },
  });
}

/**
 * Every team the signed-in user belongs to, private ones included.
 *
 * The directory only lists public teams and a public profile deliberately
 * hides private ones, so without this a team you created privately is
 * reachable only by remembering its URL.
 */
export async function myTeams(userId: string) {
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true, role: true },
  });
  const roleByTeam = new Map(memberships.map((m) => [m.teamId, m.role]));
  const ids = memberships.map((m) => m.teamId);

  const rows = await db.query.teams.findMany({
    where:
      ids.length > 0
        ? or(eq(teams.ownerId, userId), inArray(teams.id, ids))
        : eq(teams.ownerId, userId),
    columns: {
      id: true,
      slug: true,
      name: true,
      crestUrl: true,
      visibility: true,
      ageGroup: true,
      city: true,
    },
    orderBy: [asc(teams.name)],
  });

  return rows.map((t) => ({
    ...t,
    // Claiming predates team_members, so fall back to owner for older teams.
    role: roleByTeam.get(t.id) ?? "owner",
  }));
}
