import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, events, matches, teamMembers, teams } from "@/db/schema";

import { ageGroupOf, parseAgeGroupFilter, seasonYearOf } from "./age";

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

/** % and _ are LIKE wildcards; a search for "50%" must not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
  const term = filter.q?.trim() ? `%${escapeLike(filter.q.trim())}%` : null;
  const affiliation =
    filter.affiliation === "club" || filter.affiliation === "independent"
      ? filter.affiliation
      : null;

  return and(
    listable,
    // The club's name is searched as well as the team's, because "Crossfire"
    // is what somebody types and no Crossfire team is called that: they are
    // "XF, U14, B12 - 13, RCL 1, Plackov".
    term
      ? or(ilike(teams.name, term), ilike(teams.city, term), ilike(clubs.name, term))
      : undefined,
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
      club: { columns: { slug: true, name: true, crestUrl: true } },
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
      // The timezone comes along because a match's date is the organizer's
      // date: a 6pm Sunday kickoff in Seattle is Monday in UTC, and a history
      // that puts games on the wrong day is worse than one with no dates.
      event: { columns: { slug: true, title: true, timezone: true } },
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
