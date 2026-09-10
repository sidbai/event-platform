import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubAliases, clubs, eventTeams, teams } from "@/db/schema";

import { groupUnplaced, type UnplacedGroup } from "./grouping";
import { clubIndex, matchClub, type ClubMatch } from "./matching";

/** Every club, for a picker. Deliberately without the review aggregates. */
export async function clubOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .orderBy(asc(clubs.name));
}

/** The approved aliases, keyed the way matchClub expects them. */
export async function clubAliasMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ alias: clubAliases.alias, clubId: clubAliases.clubId })
    .from(clubAliases);
  return new Map(rows.map((r) => [r.alias, r.clubId]));
}

export type ProposedTeam = {
  id: string;
  slug: string;
  name: string;
  events: number;
};

export type ClubProposal = {
  clubId: string;
  clubName: string;
  clubSlug: string;
  /** The alias worth saving when this is confirmed. */
  key: string;
  because: ClubMatch["because"];
  teams: ProposedTeam[];
};

/**
 * Teams nobody has placed, grouped by the club they appear to belong to.
 *
 * Only teams whose affiliation is still 'unknown': one marked independent has
 * been answered, and one already linked is done. Ordered by how many teams a
 * decision would settle, because confirming Crossfire is worth a hundred and
 * fifty rows and confirming a one-team club is worth one.
 */
export async function clubProposals(): Promise<{
  proposals: ClubProposal[];
  unmatched: number;
}> {
  const [rows, clubRows, aliases] = await Promise.all([
    db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        events: sql<number>`count(${eventTeams.id})::int`,
      })
      .from(teams)
      .leftJoin(eventTeams, eq(eventTeams.teamId, teams.id))
      .where(eq(teams.affiliation, "unknown"))
      .groupBy(teams.id)
      .orderBy(asc(teams.name)),
    db
      .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
      .from(clubs)
      .orderBy(asc(clubs.name)),
    clubAliasMap(),
  ]);

  const index = clubIndex(clubRows);
  const byKey = new Map<string, ClubProposal>();
  let unmatched = 0;

  for (const team of rows) {
    const hit = matchClub(team.name, aliases, index);
    if (!hit) {
      unmatched++;
      continue;
    }
    const club = clubRows.find((c) => c.id === hit.clubId);
    if (!club) continue;
    // Grouped by club rather than by key, so "xf" and "crossfire" arrive as
    // one decision about Crossfire rather than two identical-looking rows.
    const group = byKey.get(hit.clubId) ?? {
      clubId: club.id,
      clubName: club.name,
      clubSlug: club.slug,
      key: hit.key,
      because: hit.because,
      teams: [],
    };
    group.teams.push(team);
    // One name match anywhere in the group makes it a proposal, not a rule
    // already approved.
    if (hit.because === "name") group.because = "name";
    byKey.set(hit.clubId, group);
  }

  const proposals = [...byKey.values()].sort(
    (a, b) => b.teams.length - a.teams.length || a.clubName.localeCompare(b.clubName),
  );
  return { proposals, unmatched };
}

/**
 * Teams no club claims, gathered by the club they came from.
 *
 * The directory does not have these clubs, so `clubProposals` cannot see
 * them and every one arrives as its own row: thirty-nine MRFC teams spread
 * alphabetically through nine hundred others. Grouped on the words their
 * names share, that is one decision instead of thirty-nine — and filing it
 * saves the alias, so the next sync places the same names on its own.
 *
 * `rest` is capped because it is the part nobody can act on in bulk; the
 * count says how much of it there is.
 */
export async function unplacedGroups(restLimit = 60): Promise<{
  groups: UnplacedGroup<ProposedTeam>[];
  rest: ProposedTeam[];
  restTotal: number;
}> {
  const [rows, clubRows, aliases] = await Promise.all([
    db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        events: sql<number>`count(${eventTeams.id})::int`,
      })
      .from(teams)
      .leftJoin(eventTeams, eq(eventTeams.teamId, teams.id))
      .where(eq(teams.affiliation, "unknown"))
      .groupBy(teams.id)
      .orderBy(asc(teams.name)),
    db.select({ id: clubs.id, name: clubs.name }).from(clubs),
    clubAliasMap(),
  ]);

  const index = clubIndex(clubRows);
  const unmatched = rows.filter((t) => !matchClub(t.name, aliases, index));
  const { groups, rest } = groupUnplaced(unmatched);
  return { groups, rest: rest.slice(0, restLimit), restTotal: rest.length };
}

/** The teams a club has, for its page. */
export async function teamsForClub(clubId: string) {
  return db
    .select({ id: teams.id, slug: teams.slug, name: teams.name })
    .from(teams)
    .where(eq(teams.clubId, clubId))
    .orderBy(asc(teams.name));
}

/** How much of the directory is still unplaced, for the admin index. */
export async function unknownTeamCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.affiliation, "unknown"));
  return row?.n ?? 0;
}
