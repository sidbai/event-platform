import { and, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { teamMerges } from "@/db/schema";

type DroppedEntry = { eventId?: string; sourceTeamId?: string | null };

/**
 * The platform's ids for teams a merge folded away in this event, and which
 * team each of them now means.
 *
 * When both halves of a merge were entered in the same event, the loser's
 * entry has to go — one entry per team per event — and that entry was the
 * only row holding the platform's id for it. The next poll found the id
 * unbound, could not bind the published name to a survivor the club's own
 * naming had renamed, and made the merged-away team again: seven came back
 * in one afternoon, each taking back the games it had just been folded out
 * of.
 *
 * The journal kept the dropped entry whole so a merge could be undone; this
 * reads it for the other purpose. An undone merge no longer speaks. One
 * whose survivor was itself merged away has a null survivor and is skipped —
 * the later merge's own journal carries what it dropped. Where two mention
 * the same id, the later one wins.
 */
export async function mergedAwaySources(eventId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ survivorId: teamMerges.survivorId, dropped: teamMerges.dropped })
    .from(teamMerges)
    .where(
      and(
        isNull(teamMerges.undoneAt),
        isNotNull(teamMerges.survivorId),
        // Containment, so only the merges that touched this event are read.
        sql`${teamMerges.dropped}->'eventTeams' @> ${JSON.stringify([{ eventId }])}::jsonb`,
      ),
    )
    .orderBy(teamMerges.mergedAt);

  const out = new Map<string, string>();
  for (const row of rows) {
    const entries = (row.dropped as { eventTeams?: DroppedEntry[] }).eventTeams ?? [];
    for (const entry of entries) {
      if (entry.eventId === eventId && entry.sourceTeamId) {
        out.set(entry.sourceTeamId, row.survivorId!);
      }
    }
  }
  return out;
}
