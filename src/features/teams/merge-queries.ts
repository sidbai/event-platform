import "server-only";

import { asc, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, teams } from "@/db/schema";

import { pairOf, proposeMatches } from "./match-plan";
import { dismissedPairs, pairKey } from "./non-duplicates";
import { groupDuplicates, type MergeCandidate } from "./merge-plan";

/**
 * Every team row, with enough about it to decide whether two are one team.
 *
 * Only rows a connector or an import created — a team somebody typed in here
 * is not a duplicate of anything, and pulling hand-made teams into this
 * screen would invite exactly the merge that cannot be undone.
 */
export async function duplicateTeamGroups() {
  const rows = await db.query.teams.findMany({
    where: isNotNull(teams.originEventId),
    orderBy: [asc(teams.name)],
    columns: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      visibility: true,
    },
    with: {
      eventTeams: { columns: { sourceTeamId: true, eventId: true } },
    },
  });

  // One query rather than one per team: this list is the whole directory.
  // Home and away count together, since either is a game they played.
  const counts = await db.execute<{ team_id: string; n: number }>(sql`
    select t.id as team_id, count(m.id)::int as n
    from teams t
    left join matches m on m.home_team_id = t.id or m.away_team_id = t.id
    group by t.id
  `);
  const matchesByTeam = new Map<string, number>(
    (counts as unknown as { team_id: string; n: number }[]).map((r) => [r.team_id, r.n]),
  );

  const candidates: MergeCandidate[] = rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    ownerId: t.ownerId,
    visibility: t.visibility,
    sourceTeamIds: [
      ...new Set(t.eventTeams.map((e) => e.sourceTeamId).filter(Boolean) as string[]),
    ],
    matches: matchesByTeam.get(t.id) ?? 0,
    events: new Set(t.eventTeams.map((e) => e.eventId)).size,
  }));

  return groupDuplicates(candidates);
}


/**
 * Pairs of same-club rows that the schedule itself says are two teams.
 *
 * Two facts, both free and both stronger than any resemblance between names:
 * a team does not play itself, and a division does not contain the same side
 * twice. Measured against the directory these rule out 24 of 259 standing
 * proposals — small, but they are the 24 nobody should ever have been asked
 * about, and they are the ones a person is most likely to wave through
 * because the names look so alike.
 *
 * Both queries are restricted to pairs within one club, which is the only
 * place a proposal can come from. That keeps what crosses the wire to a few
 * hundred rows rather than every fixture in the database — a full read of
 * this table, repeated through one evening, once exhausted the month's
 * transfer allowance and took the site down with it.
 */
async function pairsTheFixturesRuleOut(): Promise<Set<string>> {
  const played = await db.execute<{ a: string; b: string }>(sql`
    select distinct m.home_team_id as a, m.away_team_id as b
    from matches m
    join teams ha on ha.id = m.home_team_id
    join teams aa on aa.id = m.away_team_id
    where ha.club_id is not null and ha.club_id = aa.club_id
  `);

  /*
   * Grouped by division where the import recorded one, and by the group label
   * otherwise. Some platforms give us a division row and some only ever give
   * us the text, and reading just one of them halves the rule.
   */
  const together = await db.execute<{ a: string; b: string }>(sql`
    select distinct x.team_id as a, y.team_id as b
    from event_teams x
    join event_teams y
      on y.event_id = x.event_id
     and y.team_id > x.team_id
     and (
       (x.division_id is not null and x.division_id = y.division_id)
       or (x.division_id is null and x.group_label is not null and x.group_label = y.group_label)
     )
    join teams tx on tx.id = x.team_id
    join teams ty on ty.id = y.team_id
    where tx.club_id is not null and tx.club_id = ty.club_id
  `);

  const out = new Set<string>();
  for (const rows of [played, together]) {
    for (const r of rows as unknown as { a: string; b: string }[]) out.add(pairOf(r.a, r.b));
  }
  return out;
}

/**
 * Pairs that look like one team but were never spelled alike.
 *
 * The exact finder above only sees what the platforms wrote identically, so
 * it can clean up after a sync but never notice that two tournaments named
 * the same side differently. This is the other half — and the half that
 * empties the queue for good, because confirming one writes an alias and the
 * next import binds to it.
 */
export async function proposedTeamMatches(
  /** Ids already offered together above, so a pair is never asked twice. */
  alreadyGrouped: Map<string, string> = new Map(),
) {
  const rows = await db.query.teams.findMany({
    where: isNotNull(teams.clubId),
    columns: {
      id: true,
      slug: true,
      name: true,
      clubId: true,
      gender: true,
      birthYears: true,
      tier: true,
    },
    with: { eventTeams: { columns: { eventId: true } } },
  });

  const counts = await db.execute<{ team_id: string; n: number }>(sql`
    select t.id as team_id, count(m.id)::int as n
    from teams t
    left join matches m on m.home_team_id = t.id or m.away_team_id = t.id
    group by t.id
  `);
  const matchesByTeam = new Map<string, number>(
    (counts as unknown as { team_id: string; n: number }[]).map((r) => [r.team_id, r.n]),
  );

  const clubRows = await db.select({ id: clubs.id, name: clubs.name }).from(clubs);

  const proposals = proposeMatches(
    rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      clubId: t.clubId,
      gender: t.gender,
      birthYears: t.birthYears,
      tier: t.tier,
      events: new Set(t.eventTeams.map((e) => e.eventId)).size,
      matches: matchesByTeam.get(t.id) ?? 0,
    })),
    new Map(clubRows.map((c) => [c.id, c.name])),
    await pairsTheFixturesRuleOut(),
  );

  const ruledOut = await dismissedPairs();

  /*
   * Minus what the exact finder already offers, and minus what somebody has
   * already said is two different teams.
   *
   * More than half of these — 210 of 390 — were pairs from a group above,
   * shown again under a different heading. A queue that asks the same
   * question twice teaches people to skim it.
   */
  return proposals.filter((p) => {
    const [a, b] = pairKey(p.a.id, p.b.id);
    if (ruledOut.has(`${a}:${b}`)) return false;
    return (
      !alreadyGrouped.has(p.a.id) ||
      alreadyGrouped.get(p.a.id) !== alreadyGrouped.get(p.b.id)
    );
  });
}
