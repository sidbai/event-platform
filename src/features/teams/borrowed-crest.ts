import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { clubs, teams } from "@/db/schema";

/**
 * Giving a team its club's crest as its own.
 *
 * The fallback at render — crestOf — is still there and still right for a row
 * that slips through. But it has to be remembered at every call site, and it
 * was not on the event page, and then it was not on somebody's own page
 * either: a rule nobody can forget beats a rule everybody agrees with.
 *
 * The owner's decision, over my objection, and the objection was about the
 * two ways a copy goes stale. Both are handled here rather than left to be
 * discovered:
 *
 *   a club changes its logo   → carried to every team still wearing the old
 *                               one, which is what `rewear` does below
 *   a team is re-filed        → the new club's crest replaces the old club's,
 *                               which `wearClubCrest` does for one team
 *
 * What is never touched is a crest somebody uploaded for the team itself.
 * That is the whole of the distinction, and it is told by where the file
 * lives — the same test unfile.ts already uses to decide what to clear.
 */

/** Whether this image came from a club rather than from the team. */
export function isClubCrest(url: string | null | undefined): boolean {
  return (url ?? "").includes("/clubs/");
}

/**
 * One team takes its club's crest, if it has nothing of its own or is still
 * wearing another club's.
 */
export async function wearClubCrest(teamId: string): Promise<boolean> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { crestUrl: true, clubId: true },
    with: { club: { columns: { crestUrl: true } } },
  });
  if (!team?.club?.crestUrl) return false;
  if (team.crestUrl && !isClubCrest(team.crestUrl)) return false;
  if (team.crestUrl === team.club.crestUrl) return false;

  await db
    .update(teams)
    .set({ crestUrl: team.club.crestUrl, updatedAt: new Date() })
    .where(eq(teams.id, teamId));
  return true;
}

/**
 * A club's teams change with it.
 *
 * Without this the copy is stale the first time a club uploads a new logo,
 * which was the whole of the argument against copying. Only the teams wearing
 * the club's old crest or nothing — never one with its own.
 */
export async function rewear(clubId: string, crestUrl: string | null): Promise<number> {
  const mine = await db.query.teams.findMany({
    where: eq(teams.clubId, clubId),
    columns: { id: true, crestUrl: true },
  });
  const borrowed = mine.filter((t) => !t.crestUrl || isClubCrest(t.crestUrl));
  for (const team of borrowed) {
    await db
      .update(teams)
      .set({ crestUrl, updatedAt: new Date() })
      .where(eq(teams.id, team.id));
  }
  return borrowed.length;
}

export type CrestPlan = {
  club: string;
  teams: number;
}[];

/** What the backfill would do, by club. Reads only. */
export async function planCrests(): Promise<CrestPlan> {
  const rows = await db
    .select({ club: clubs.name, crest: clubs.crestUrl, teamId: teams.id })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(and(isNull(teams.crestUrl), or(isNull(teams.crestUrl), eq(teams.crestUrl, ""))));

  const byClub = new Map<string, number>();
  for (const row of rows) {
    if (!row.crest) continue;
    byClub.set(row.club, (byClub.get(row.club) ?? 0) + 1);
  }
  return [...byClub]
    .map(([club, n]) => ({ club, teams: n }))
    .sort((a, b) => b.teams - a.teams);
}

/** Give every crestless team its club's, and say how many. */
export async function backfillCrests(): Promise<number> {
  const rows = await db
    .select({ id: teams.id, crest: clubs.crestUrl })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(isNull(teams.crestUrl));

  let written = 0;
  for (const row of rows) {
    if (!row.crest) continue;
    await db
      .update(teams)
      .set({ crestUrl: row.crest, updatedAt: new Date() })
      .where(and(eq(teams.id, row.id), isNull(teams.crestUrl)));
    written++;
  }
  return written;
}
