import "server-only";

import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubAliases, clubs as clubsTable, teams as teamsTable } from "@/db/schema";

import { bandPairs, type BandPair, type ClubName } from "./age-bands";

/**
 * The candidate pairs, narrowed in the database before anything is read.
 *
 * The columns do most of the work — same club, same gender, same tier, same
 * programme, and one cohort exactly inside the other — which turns two and a
 * half thousand teams into about a hundred rows. The part that cannot be done
 * in SQL is comparing what is left of the two names once the club, the
 * cohort, the tier and the stream come out, so that happens here on the
 * hundred rather than on all of them.
 */
export async function candidateBandPairs(): Promise<BandPair[]> {
  const rows = await db.execute<{
    single_id: string;
    band_id: string;
  }>(sql`
    select a.id as single_id, b.id as band_id
    from teams a
    join teams b
      on b.club_id = a.club_id
     and b.id <> a.id
     and array_length(b.birth_years, 1) = 2
     and b.birth_years[1] = a.birth_years[1]
     and b.birth_years[2] = a.birth_years[1] + 1
     and a.gender is not distinct from b.gender
     and a.tier is not distinct from b.tier
     and a.program is not distinct from b.program
    where a.club_id is not null
      and array_length(a.birth_years, 1) = 1
  `);
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((r) => [r.single_id, r.band_id]))];

  /*
   * The query builder for the lists, not hand-written SQL: binding an array
   * of ids into a statement is where a list of values stops being data. The
   * self-join above takes none.
   */
  const teams = await db.query.teams.findMany({
    where: inArray(teamsTable.id, ids),
    columns: {
      id: true,
      name: true,
      slug: true,
      clubId: true,
      birthYears: true,
      gender: true,
      tier: true,
      program: true,
    },
  });

  const clubIds = [...new Set(teams.map((t) => t.clubId).filter((id): id is string => !!id))];
  const [clubRows, aliasRows] = await Promise.all([
    db.query.clubs.findMany({
      where: inArray(clubsTable.id, clubIds),
      columns: { id: true, slug: true, name: true, shortName: true },
    }),
    db.query.clubAliases.findMany({
      where: inArray(clubAliases.clubId, clubIds),
      columns: { clubId: true, alias: true },
    }),
  ]);
  const aliasesByClub = new Map<string, string[]>();
  for (const a of aliasRows) {
    aliasesByClub.set(a.clubId, [...(aliasesByClub.get(a.clubId) ?? []), a.alias]);
  }
  const clubs = new Map<string, ClubName>(
    clubRows.map((c) => [
      c.id,
      { slug: c.slug, name: c.name, shortName: c.shortName, aliases: aliasesByClub.get(c.id) ?? [] },
    ]),
  );

  /*
   * How much each side brings, so the choice is visible on the page. Counted
   * for the hundred teams in play rather than for every team there is.
   */
  const weights = await db.execute<{ id: string; matches: number; events: number }>(sql`
    select t.id,
      (select count(*)::int from matches m
        where m.home_team_id = t.id or m.away_team_id = t.id) as matches,
      (select count(*)::int from event_teams et where et.team_id = t.id) as events
    from teams t where t.id in ${rows.length > 0 ? sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`(null)`}
  `);
  const weightById = new Map(weights.map((w) => [w.id, w]));

  return bandPairs(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      clubId: t.clubId,
      birthYears: t.birthYears ?? [],
      gender: t.gender,
      tier: t.tier,
      program: t.program,
      matches: Number(weightById.get(t.id)?.matches ?? 0),
      events: Number(weightById.get(t.id)?.events ?? 0),
    })),
    clubs,
  );
}
