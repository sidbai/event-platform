import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, teams } from "@/db/schema";

import { decodeLogo, extensionFor } from "./bundle-logos";

export type LogoReport = { set: number; kept: number; unmatched: number; refused: number };

/**
 * Give the badges a bundle carried to the teams in this event that have
 * none.
 *
 * Matched by the name the platform published, which the entry remembers
 * as sourceName — the team's own name here may have been rewritten by the
 * club naming. A team with a crest already keeps it: an owner's upload is
 * not something a weekly import gets to replace. Each badge is copied into
 * our own store, under the team's slug like any other crest.
 */
export async function applyBundleLogos(
  eventId: string,
  logos: Map<string, string>,
): Promise<LogoReport> {
  const report: LogoReport = { set: 0, kept: 0, unmatched: 0, refused: 0 };
  for (const [name, dataUrl] of logos) {
    const entry = await db.query.eventTeams.findFirst({
      where: and(eq(eventTeams.eventId, eventId), eq(eventTeams.sourceName, name)),
      with: { team: { columns: { id: true, slug: true, crestUrl: true } } },
    });
    if (!entry?.team) {
      report.unmatched++;
      continue;
    }
    if (entry.team.crestUrl) {
      report.kept++;
      continue;
    }
    const decoded = decodeLogo(dataUrl);
    if (!decoded) {
      report.refused++;
      continue;
    }
    const blob = await put(
      `crests/${entry.team.slug}/badge.${extensionFor(decoded.type)}`,
      Buffer.from(decoded.bytes),
      { access: "public", contentType: decoded.type, addRandomSuffix: true },
    );
    await db.update(teams).set({ crestUrl: blob.url }).where(eq(teams.id, entry.team.id));
    report.set++;
  }
  return report;
}
