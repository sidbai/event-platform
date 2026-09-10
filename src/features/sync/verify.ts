import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Whether an import landed the way it should have, asked of the database.
 *
 * Every check here was written by hand the night the Elite Academy league was
 * imported, as a throwaway script that pulled the whole teams table and
 * compared it in memory. Doing that a dozen times over one evening exhausted
 * the database's data transfer allowance and took the site down for an hour,
 * which is a silly way to find out that the question "did this import go
 * wrong" belongs in SQL: every answer below is a count and five examples,
 * and the whole report crosses the wire in a few kilobytes.
 *
 * The checks are the ones that caught something real:
 *
 *   cohorts     a U17 fixture with a B10/11 side in it. 344 of 928 fixtures,
 *               caused by binding a club's U13 team to its U14 team because
 *               the two-year bands overlap by a year.
 *   divisions   a fixture filed under an age group none of its teams is in —
 *               the same fault seen from the other side.
 *   sharing     seven ages of Harbor SC all called "Harbor SC", because the
 *               platform states the gender in a column nobody read.
 *   homeless    nine ALBION teams under a club in Portland, because the two
 *               ALBION clubs they belong to were not in the directory.
 *   slots       "A11" read as a team, because Sports Affinity writes the
 *               bracket slot in the team column until a club is assigned.
 *   addresses   /teams/harbor-sc-7, from rows named before the gender was
 *               known and renamed afterwards.
 */

export type Finding = {
  key: string;
  what: string;
  count: number;
  examples: string[];
  /**
   * Whether this is a fault or a thing to read.
   *
   * The first version called everything a fault and reported eighty-nine on a
   * tournament, all of them a club playing a side up an age group, which is
   * what tournaments are for. A checker that cries wolf gets read once.
   */
  severity: "wrong" | "look";
};

export type Verification = {
  event: { slug: string; title: string };
  fixtures: number;
  entries: number;
  divisions: number;
  findings: Finding[];
};

/** One check: a count, and up to five of them to read. */
async function check(
  key: string,
  severity: Finding["severity"],
  what: string,
  countQuery: ReturnType<typeof sql>,
  exampleQuery: ReturnType<typeof sql>,
): Promise<Finding> {
  const [{ n }] = await db.execute<{ n: number }>(countQuery);
  if (Number(n) === 0) return { key, severity, what, count: 0, examples: [] };
  const rows = await db.execute<{ line: string }>(exampleQuery);
  return { key, severity, what, count: Number(n), examples: rows.map((r) => r.line) };
}

export async function verifyEvent(slug: string): Promise<Verification | null> {
  const [event] = await db.execute<{ id: string; slug: string; title: string }>(
    sql`select id, slug, title from events where slug = ${slug}`,
  );
  if (!event) return null;
  const id = event.id;

  const [totals] = await db.execute<{
    fixtures: number;
    entries: number;
    divisions: number;
  }>(sql`
    select
      (select count(*) from matches where event_id = ${id}) as fixtures,
      (select count(*) from event_teams where event_id = ${id}) as entries,
      (select count(*) from event_divisions where event_id = ${id}) as divisions
  `);

  /*
   * Two cohorts are the same age group when one is inside the other — a club
   * that names a single-year side plays in the band containing it. Postgres
   * says that with array containment, which is the same rule sameCohort
   * applies in TypeScript and has to stay that way.
   */
  /*
   * Within one division only.
   *
   * A tournament exists partly so a club can play a side up an age group, and
   * asking this of every fixture reported eighty-nine of those as faults. A
   * division is the promise that everyone in it is the same age, so that is
   * where the question means something — and both teams have to be entered in
   * the division their fixture is filed under, or the comparison is between a
   * flight and a visitor to it.
   */
  const mixedCohorts = sql`
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    join event_teams eh on eh.team_id = m.home_team_id and eh.event_id = ${id}
    join event_teams ea on ea.team_id = m.away_team_id and ea.event_id = ${id}
    where m.event_id = ${id}
      and m.division_id is not null
      and eh.division_id = m.division_id
      and ea.division_id = m.division_id
      and array_length(h.birth_years, 1) is not null
      and array_length(a.birth_years, 1) is not null
      and not (h.birth_years <@ a.birth_years or h.birth_years @> a.birth_years)
  `;

  const wrongDivision = sql`
    from matches m
    join event_teams et on et.team_id = m.home_team_id and et.event_id = ${id}
    where m.event_id = ${id} and m.division_id is distinct from et.division_id
  `;

  const findings = await Promise.all([
    check(
      "cohorts",
      /*
       * Worth reading, not a fault. Even inside one division this cannot tell
       * a club entering a younger side — which is most of them, and which
       * Crossfire do in the Sports Affinity U8 flight every season — from a
       * league whose ages got crossed. The check that names the second one
       * without the first is "divisions", below.
       */
      "look",
      "fixtures pairing two age groups — usually a side playing up",
      sql`select count(*)::int as n ${mixedCohorts}`,
      sql`select h.name || '  [' || array_to_string(h.birth_years, '/') || ']  v  ' || a.name || '  [' || array_to_string(a.birth_years, '/') || ']' as line
          ${mixedCohorts} limit 5`,
    ),
    check(
      "divisions",
      "wrong",
      "fixtures filed under a division their own team is not in",
      sql`select count(*)::int as n ${wrongDivision}`,
      sql`select t.name || '  fixture in ' || coalesce(md.name, '(none)') || ', team in ' || coalesce(td.name, '(none)') as line
          from matches m
          join event_teams et on et.team_id = m.home_team_id and et.event_id = ${id}
          join teams t on t.id = m.home_team_id
          left join event_divisions md on md.id = m.division_id
          left join event_divisions td on td.id = et.division_id
          where m.event_id = ${id} and m.division_id is distinct from et.division_id
          limit 5`,
    ),
    check(
      "incomplete",
      "wrong",
      "fixtures missing a team or a division",
      /*
       * A knockout fixture names its sides before it knows them — "Winner of
       * A1" sits in a placeholder column, and reading that as a missing team
       * reported sixty-eight of them at one tournament. A side is missing only
       * when nothing at all stands in for it.
       */
      sql`select count(*)::int as n from matches
          where event_id = ${id}
            and ((home_team_id is null and home_placeholder is null)
              or (away_team_id is null and away_placeholder is null)
              or division_id is null)`,
      sql`select coalesce(kickoff_at::text, 'no date') || '  ' || coalesce(source_match_id, id::text) as line
          from matches
          where event_id = ${id}
            and ((home_team_id is null and home_placeholder is null)
              or (away_team_id is null and away_placeholder is null)
              or division_id is null)
          limit 5`,
    ),
    check(
      "homeless",
      "look",
      "teams with no club in the directory",
      sql`select count(*)::int as n from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id} and t.club_id is null`,
      sql`select t.name as line from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id} and t.club_id is null limit 5`,
    ),
    check(
      "sharing",
      "wrong",
      "names carried by more than one team",
      sql`select count(*)::int as n from (
            select t.name from event_teams et join teams t on t.id = et.team_id
            where et.event_id = ${id} group by t.name having count(*) > 1
          ) s`,
      sql`select t.name || '  ×' || count(*) as line
          from event_teams et join teams t on t.id = et.team_id
          where et.event_id = ${id} group by t.name having count(*) > 1 limit 5`,
    ),
    check(
      "slots",
      "wrong",
      "teams whose name is a bracket slot rather than a club",
      sql`select count(*)::int as n from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id} and t.name ~ '^[A-Z][0-9]{1,2}$'`,
      sql`select t.name as line from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id} and t.name ~ '^[A-Z][0-9]{1,2}$' limit 5`,
    ),
    check(
      "addresses",
      "look",
      "teams whose address does not come from their name",
      // A slug ending in a bare number that the name does not account for:
      // harbor-sc-7 for "Harbor Soccer Club B13/14". A cohort ending in
      // digits — albion-sc-hawaii-b07-08 — is not one of these.
      sql`select count(*)::int as n from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id}
            and t.slug ~ '-[0-9]+$'
            and t.slug !~ ('^' || regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g'))`,
      sql`select t.name || '  ->  /teams/' || t.slug as line from event_teams et
          join teams t on t.id = et.team_id
          where et.event_id = ${id}
            and t.slug ~ '-[0-9]+$'
            and t.slug !~ ('^' || regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g'))
          limit 5`,
    ),
  ]);

  return {
    event: { slug: event.slug, title: event.title },
    fixtures: Number(totals.fixtures),
    entries: Number(totals.entries),
    divisions: Number(totals.divisions),
    findings,
  };
}
