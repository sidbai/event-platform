import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, events, matches, teamMembers, teams } from "@/db/schema";

import { endOf } from "@/features/events/completion";
import { searchTerms } from "@/features/search/terms";

import { ageGroupOf, parseAgeGroupFilter, seasonYearOf } from "./age";
import { nextFixture, previewOf, worthShowing, type Preview } from "./preview";

/**
 * Teams anyone may see listed.
 *
 * Every team is listed unless somebody chose otherwise. Teams created for an
 * event used to be written 'private' — meaning "we did not put it here on
 * purpose", not "keep it secret" — and this clause had to let them back in,
 * which meant a team marked private by its own owner could still be listed if
 * it happened to have been imported first. They are created public now, so
 * private means what it says.
 */
const listable = eq(teams.visibility, "public");

export type TeamFilter = {
  q?: string;
  /** 'club' or 'independent'; anything else means no filter. */
  affiliation?: string;
  /** A club's slug, from the pinned chips. */
  club?: string;
  /** An age group as this season names it — "BU12". */
  age?: string;
  window?: { limit: number; offset: number };
};

/**
 * How the directory is ordered.
 *
 * Pinned clubs' teams first, then anything else with a club, then the rest.
 * The reason is what a stranger is here for: 966 rows alphabetical opens on
 * "2015 Spuraways" and "90+ B17-18 Valdez", which tells them nothing about
 * whether this site knows their league. Leading with the clubs an admin
 * thought worth pinning answers that in the first screen.
 *
 * Alphabetical within each band, so the order is still predictable and a
 * page-two link keeps meaning what it meant.
 */
const directoryOrder = [
  sql`case
    when ${clubs.pinned} then 0
    when ${teams.clubId} is not null then 1
    else 2
  end`,
  asc(teams.name),
];

function teamWhere(filter: TeamFilter) {
  const terms = searchTerms(filter.q);
  const affiliation =
    filter.affiliation === "club" || filter.affiliation === "independent"
      ? filter.affiliation
      : null;

  return and(
    listable,
    // The club's name is searched as well as the team's, because "Crossfire"
    // is what somebody types and no Crossfire team is called that: they are
    // "XF, U14, B12 - 13, RCL 1, Plackov".
    //
    // Every word has to land, but each may land in a different column —
    // "crossfire b14" is the club in one and the age group in another.
    ...terms.map((term) =>
      or(ilike(teams.name, term), ilike(teams.city, term), ilike(clubs.name, term)),
    ),
    affiliation ? eq(teams.affiliation, affiliation) : undefined,
    filter.club ? eq(clubs.slug, filter.club) : undefined,
    ...ageWhere(filter.age),
  );
}

/**
 * An age group, as the years it means this season.
 *
 * Matched on the first birth year rather than the whole array: {2014} and
 * {2014, 2015} are the same children written two ways, and both are in the
 * data. Postgres arrays are 1-indexed.
 */
function ageWhere(raw: string | undefined) {
  const age = parseAgeGroupFilter(raw, seasonYearOf(new Date()));
  if (!age) return [];
  return [
    eq(teams.gender, age.gender),
    sql`${teams.birthYears}[1] = ${age.firstBirthYear}`,
  ];
}

/**
 * The age groups that actually have teams, newest-born first.
 *
 * Built from the data rather than listed, so the page never offers a chip
 * that finds nothing — and so it shrinks and grows on its own as the
 * directory does.
 */
export async function teamAgeGroups(
  filter: Omit<TeamFilter, "age" | "window"> = {},
): Promise<{ value: string; label: string; count: number }[]> {
  const season = seasonYearOf(new Date());
  const rows = await db
    .select({
      gender: teams.gender,
      first: sql<number>`${teams.birthYears}[1]`,
      n: sql<number>`count(*)::int`,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    // Counted inside whatever else is filtering, the same as the category
    // chips: a "BU12 46" beside a club showing eight teams is a count of a
    // page nobody is looking at.
    .where(and(teamWhere({ ...filter, age: undefined }), sql`cardinality(${teams.birthYears}) > 0`))
    .groupBy(teams.gender, sql`${teams.birthYears}[1]`);

  const byGroup = new Map<string, number>();
  for (const row of rows) {
    const label = ageGroupOf([row.first], row.gender, season);
    if (!label) continue;
    byGroup.set(label, (byGroup.get(label) ?? 0) + row.n);
  }

  // Boys then girls, youngest first inside each. Sorted numerically, or
  // "BU10" lands before "BU9" and the row reads as a shuffle.
  return [...byGroup]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort(
      (a, b) =>
        a.value[0].localeCompare(b.value[0]) ||
        Number(a.value.slice(2)) - Number(b.value.slice(2)),
    );
}

/** The team directory: what the /teams page lists, searches and pages. */
export async function listTeams(filter: TeamFilter = {}) {
  const where = teamWhere(filter);

  // Counted before slicing, so the pager sizes the whole result. The join has
  // to be here too: the search and the club chips both reach into clubs.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .where(where);

  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      crestUrl: teams.crestUrl,
      ageGroup: teams.ageGroup,
      birthYears: teams.birthYears,
      tier: teams.tier,
      program: teams.program,
      city: teams.city,
      clubName: clubs.name,
      clubCrestUrl: clubs.crestUrl,
      events: sql<number>`(
        select count(*) from event_teams et where et.team_id = ${teams.id}
      )::int`,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .where(where)
    .orderBy(...directoryOrder)
    .limit(filter.window?.limit ?? 1000)
    .offset(filter.window?.offset ?? 0);

  return {
    total,
    rows: rows.map(({ clubName, clubCrestUrl, ...team }) => ({
      ...team,
      club: clubName ? { name: clubName, crestUrl: clubCrestUrl } : null,
    })),
  };
}

/**
 * How many teams sit in each category, for the filter chips.
 *
 * Counted within the search rather than across everything: a chip reading
 * "All 939" beside a list of two results describes a page nobody is looking
 * at, and invites a click that appears to lose the search.
 */
export async function teamCounts(
  filter: Omit<TeamFilter, "affiliation" | "window"> = {},
): Promise<{ all: number; club: number; independent: number }> {
  const count = async (affiliation?: string) => {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teams)
      .leftJoin(clubs, eq(clubs.id, teams.clubId))
      .where(teamWhere({ ...filter, affiliation }));
    return n;
  };
  const [all, club, independent] = await Promise.all([
    count(),
    count("club"),
    count("independent"),
  ]);
  return { all, club, independent };
}

/** The clubs worth offering as a one-click filter. */
export async function pinnedClubs(): Promise<{ slug: string; name: string }[]> {
  return db
    .select({ slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.pinned, true))
    .orderBy(asc(clubs.name));
}

export async function getTeamBySlug(slug: string) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    with: {
      originEvent: { columns: { slug: true, title: true } },
      members: {
        with: {
          user: {
            columns: { displayName: true, username: true },
          },
        },
      },
      eventTeams: { with: { event: true, division: true } },
      club: { columns: { slug: true, name: true, crestUrl: true } },
    },
  });
  if (!team) return null;

  /*
   * Latest to finish first, the way a history reads. This was ordered by
   * points, which is zero for every team a connector created — so the order
   * was whatever the database felt like returning. Sorted here rather than in
   * the query because the date lives on the event, and a relational `with`
   * cannot order a relation by its own relation's column.
   *
   * By the end and not the start, which only began to matter once a season
   * was in the list: the ECNL league runs to next May and started a week
   * before Labor Day weekend, so by start date the competition being played
   * now sat underneath a tournament that had already finished. Through endOf,
   * so an event with no end time is placed the way the lifecycle chip places
   * it rather than by a second opinion.
   */
  team.eventTeams.sort(
    (a, b) =>
      (endOf({ startsAt: b.event.startsAt, endsAt: b.event.endsAt })?.getTime() ?? 0) -
      (endOf({ startsAt: a.event.startsAt, endsAt: a.event.endsAt })?.getTime() ?? 0),
  );

  const playedMatches = await db.query.matches.findMany({
    where: or(eq(matches.homeTeamId, team.id), eq(matches.awayTeamId, team.id)),
    orderBy: [desc(matches.kickoffAt)],
    with: {
      // The timezone comes along because a match's date is the organizer's
      // date: a 6pm Sunday kickoff in Seattle is Monday in UTC, and a history
      // that puts games on the wrong day is worse than one with no dates.
      event: { columns: { slug: true, title: true, timezone: true, status: true } },
      division: { columns: { name: true } },
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

  return { ...team, matches: playedMatches };
}

export type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeamBySlug>>>;

export type NextUp = {
  fixture: { id: string; kickoffAt: Date | null };
  opponent: { id: string; name: string; slug: string; crestUrl: string | null };
  preview: Preview;
  /** Names for the third teams both sides have played, keyed by team id. */
  opponentNames: Map<string, { name: string; slug: string }>;
};

/**
 * The next game and what both sides bring to it.
 *
 * Takes the team's matches rather than fetching them again — the page has
 * them already, and a fixture is picked out of that list rather than queried
 * for. Two queries beyond that, and only when there is a game to preview: the
 * opponent's own results, and names for whoever they have both played.
 *
 * Nothing is stored. The numbers are counted from the results each time,
 * which is the same choice record.ts made and for the same reason — a stored
 * record went stale the moment a connector wrote a score without updating it,
 * and every synced team read "0W 0D 0L" above a list of its own wins. Two
 * teams' games is a few dozen rows.
 */
export async function nextUpFor(
  teamId: string,
  teamMatches: { id: string; kickoffAt: Date | null; homeTeamId: string | null; awayTeamId: string | null; homeScore: number | null; awayScore: number | null }[],
  now: Date = new Date(),
): Promise<NextUp | null> {
  const fixture = nextFixture(teamMatches, now);
  if (!fixture) return null;

  const opponentId =
    fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId;
  if (!opponentId) return null;

  const opponent = await db.query.teams.findFirst({
    where: eq(teams.id, opponentId),
    columns: { id: true, name: true, slug: true, crestUrl: true },
    with: { club: { columns: { crestUrl: true } } },
  });
  if (!opponent) return null;

  const theirMatches = await db.query.matches.findMany({
    where: or(eq(matches.homeTeamId, opponentId), eq(matches.awayTeamId, opponentId)),
    columns: {
      id: true,
      kickoffAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });

  const preview = previewOf(
    { teamId, matches: teamMatches },
    { teamId: opponentId, matches: theirMatches },
  );
  if (!worthShowing(preview)) {
    // Both sides new here and nobody in common — which is most of a
    // tournament's teams on the day it is imported. A heading over four empty
    // columns is worse than no heading.
    return {
      fixture: { id: fixture.id, kickoffAt: fixture.kickoffAt },
      opponent: { ...opponent, crestUrl: opponent.crestUrl ?? opponent.club?.crestUrl ?? null },
      preview,
      opponentNames: new Map(),
    };
  }

  const sharedIds = preview.shared.map((s) => s.teamId);
  const names = sharedIds.length
    ? await db.query.teams.findMany({
        where: inArray(teams.id, sharedIds),
        columns: { id: true, name: true, slug: true },
      })
    : [];

  return {
    fixture: { id: fixture.id, kickoffAt: fixture.kickoffAt },
    opponent: { ...opponent, crestUrl: opponent.crestUrl ?? opponent.club?.crestUrl ?? null },
    preview,
    opponentNames: new Map(names.map((t) => [t.id, { name: t.name, slug: t.slug }])),
  };
}

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
