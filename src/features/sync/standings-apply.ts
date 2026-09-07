import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams } from "@/db/schema";

import type { PastedStanding } from "./standings-paste";

/**
 * Write an organizer's own standings against the teams we already hold.
 *
 * Never creates a team. A standings table names teams that must already be in
 * the schedule, and a name in one that matches nothing in the other is a sign
 * the paste belongs to a different division — better reported than turned
 * into a phantom entry with a points total and no fixtures.
 */

export type StandingsOutcome = {
  updated: number;
  /** Names in the table that match no team on this event. */
  unmatched: string[];
};

/**
 * Loose enough for punctuation and case, strict enough not to merge two teams.
 *
 * Letters and digits of any script: stripping to [a-z0-9] deletes every
 * non-Latin character, which made 烙饼FC and 吃饼FC the same string and would
 * have attached one club's standing to another's row.
 */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function applyPastedStandings(
  eventId: string,
  rows: PastedStanding[],
): Promise<StandingsOutcome> {
  const entries = await db.query.eventTeams.findMany({
    where: eq(eventTeams.eventId, eventId),
    columns: { id: true, teamId: true },
    with: { team: { columns: { name: true } } },
  });

  const byName = new Map<string, string>();
  for (const e of entries) {
    if (e.team?.name) byName.set(normalise(e.team.name), e.id);
  }

  const unmatched: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const id = byName.get(normalise(row.team));
    if (!id) {
      unmatched.push(row.team);
      continue;
    }

    /*
     * Their numbers, not ours, and the ones they did not print stay null
     * rather than becoming zero — a table with no goals-against column is not
     * a table where everybody conceded nothing.
     */
    await db
      .update(eventTeams)
      .set({
        points: row.points ?? 0,
        ...(row.played !== null ? { played: row.played } : {}),
        ...(row.won !== null ? { won: row.won } : {}),
        ...(row.drawn !== null ? { drawn: row.drawn } : {}),
        ...(row.lost !== null ? { lost: row.lost } : {}),
        ...(row.gf !== null ? { gf: row.gf } : {}),
        ...(row.ga !== null ? { ga: row.ga } : {}),
      })
      .where(eq(eventTeams.id, id));
    updated++;
  }

  return { updated, unmatched };
}
