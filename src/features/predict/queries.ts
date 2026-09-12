import "server-only";

import { and, asc, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { matches, teamRatings } from "@/db/schema";

import { rate, replay, type Decided, type Rating } from "./elo";

/** Every decided game with both sides known, oldest first — what the model learns from. */
async function decidedGames(): Promise<Decided[]> {
  const rows = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.homeScore),
        isNotNull(matches.awayScore),
        isNotNull(matches.homeTeamId),
        isNotNull(matches.awayTeamId),
        isNotNull(matches.kickoffAt),
      ),
    )
    .orderBy(asc(matches.kickoffAt), asc(matches.id));
  return rows as Decided[];
}

/**
 * Rebuild every rating from scratch.
 *
 * Replaced wholesale rather than nudged: a score corrected last week
 * changes what every later game should have taught, and a full replay of
 * five thousand games is a second's work. Runs nightly; nothing else writes
 * this table.
 */
export async function rebuildRatings(): Promise<{ teams: number; games: number }> {
  const games = await decidedGames();
  const ratings = rate(games);
  const rows = [...ratings].map(([teamId, r]) => ({ teamId, rating: r.rating, games: r.games }));
  await db.transaction(async (tx) => {
    await tx.delete(teamRatings);
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(teamRatings).values(rows.slice(i, i + 500));
    }
  });
  return { teams: rows.length, games: games.length };
}

/** The ratings on file for these teams; a team with none is simply absent. */
export async function ratingsFor(teamIds: string[]): Promise<Map<string, Rating>> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ teamId: teamRatings.teamId, rating: teamRatings.rating, games: teamRatings.games })
    .from(teamRatings)
    .where(inArray(teamRatings.teamId, ids));
  return new Map(rows.map((r) => [r.teamId, { rating: r.rating, games: r.games }]));
}

/** How the model would have done on everything it has learned from. */
export async function modelRecord() {
  const games = await decidedGames();
  // The driver hands a timestamp back as a string; a Date is what the page wants.
  const last = await db
    .select({ at: sql<string | Date | null>`max(${teamRatings.updatedAt})` })
    .from(teamRatings);
  const at = last[0]?.at;
  return { ...replay(games), rebuiltAt: at ? new Date(at) : null };
}
