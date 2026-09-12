import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, matches } from "@/db/schema";

/**
 * Label a division's games from its entries' groups.
 *
 * Once the entries say who is in Group A and who in Group B — from a pasted
 * standings page, or from the inference — a game between two Group A sides
 * is a Group A game. A game across groups is left alone here: it is a
 * placement game or the final, and which of those is not something
 * membership can say.
 *
 * Only games with no label yet, so a label somebody set stays.
 */
export async function labelMatchesByMembership(eventId: string): Promise<number> {
  const entries = await db.query.eventTeams.findMany({
    where: eq(eventTeams.eventId, eventId),
    columns: { teamId: true, divisionId: true, groupLabel: true },
  });
  const groupOf = new Map<string, string>();
  for (const e of entries) {
    if (e.groupLabel) groupOf.set(`${e.divisionId ?? ""}|${e.teamId}`, e.groupLabel);
  }
  if (groupOf.size === 0) return 0;

  const games = await db.query.matches.findMany({
    where: and(eq(matches.eventId, eventId), isNull(matches.groupLabel)),
    columns: { id: true, divisionId: true, homeTeamId: true, awayTeamId: true },
  });
  let labelled = 0;
  for (const g of games) {
    if (!g.homeTeamId || !g.awayTeamId) continue;
    const key = (t: string) => `${g.divisionId ?? ""}|${t}`;
    const [h, a] = [groupOf.get(key(g.homeTeamId)), groupOf.get(key(g.awayTeamId))];
    if (!h || h !== a) continue;
    await db.update(matches).set({ groupLabel: h }).where(eq(matches.id, g.id));
    labelled++;
  }
  return labelled;
}
