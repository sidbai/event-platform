import "server-only";

import { asc, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, teams } from "@/db/schema";

import { proposeMatches } from "./match-plan";
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
