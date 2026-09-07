import "server-only";

import { asc, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { teams } from "@/db/schema";

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
