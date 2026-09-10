import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  eventOffers,
  eventRegistrations,
  eventTeams,
  matches,
  teamAliases,
  teamMembers,
  teamMerges,
  teamSlugs,
  teams,
} from "@/db/schema";

import { uniqueTeamSlug } from "./slug";

/**
 * Put back a team a merge absorbed.
 *
 * Reads team_merges and nothing else: the row as it stood, the ids of what
 * moved to the survivor, and the whole of what was dropped because the
 * survivor already had one. Those three are what a merge destroys, and
 * without the record none of it is recoverable.
 *
 * It restores where a row belongs, not what it looked like. A score entered
 * on a moved fixture since the merge stays as it is now — the journal says
 * which team the fixture came from, and that is all it claims to say.
 */

export type UnmergePlan = {
  mergeId: string;
  team: { id: string; name: string; slug: string };
  matches: number;
  entriesMoved: number;
  entriesRestored: number;
  registrations: number;
  offers: number;
  members: number;
  slugs: string[];
  alias: string | null;
  /**
   * Whether a live team now sits at the address this row left under.
   *
   * The merge is what took it: it gives the survivor the best of the slugs in
   * play. The row still comes back, at the next free number.
   */
  slugTaken: boolean;
};

type Moved = {
  matchesHome: string[];
  matchesAway: string[];
  eventTeams: string[];
  registrations: string[];
  offers: string[];
  members: string[];
};

type Dropped = {
  eventTeams: Record<string, unknown>[];
  registrations: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  slugs: string[];
  alias: string | null;
};

/**
 * JSON has no dates, so a stored row comes back with its timestamps as
 * strings and every timestamp column refuses it.
 *
 * Keyed on the name rather than guessing from the value: every timestamp in
 * this schema is a `somethingAt`, and a string that merely looks like a date
 * in a name or a bio is not one.
 */
function reviveTimestamps<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (key.endsWith("At") && typeof value === "string") out[key] = new Date(value);
  }
  return out as T;
}

export async function planUnmerge(mergeId: string): Promise<UnmergePlan> {
  const record = await db.query.teamMerges.findFirst({
    where: eq(teamMerges.id, mergeId),
  });
  if (!record) throw new Error(`no merge on record with id ${mergeId}`);
  if (record.undoneAt) {
    throw new Error(`that merge was already undone, at ${record.undoneAt.toISOString()}`);
  }
  if (!record.survivorId) {
    /*
     * The survivor has since been absorbed itself, so there is no row to take
     * these back off — its own fixtures have moved on again. Undoing that
     * merge first makes this one possible.
     */
    throw new Error(
      "the survivor of that merge has itself been merged away — undo that one first",
    );
  }

  const team = record.team as Record<string, unknown> & {
    id: string;
    name: string;
    slug: string;
  };
  const moved = record.moved as Moved;
  const dropped = record.dropped as Dropped;

  return {
    mergeId: record.id,
    team: { id: team.id, name: team.name, slug: team.slug },
    matches: moved.matchesHome.length + moved.matchesAway.length,
    entriesMoved: moved.eventTeams.length,
    entriesRestored: dropped.eventTeams.length,
    registrations: moved.registrations.length + dropped.registrations.length,
    offers: moved.offers.length + dropped.offers.length,
    members: moved.members.length,
    slugs: dropped.slugs,
    alias: dropped.alias,
    slugTaken: (await db.query.teams.findFirst({
      where: eq(teams.slug, team.slug),
      columns: { id: true },
    })) !== undefined,
  };
}

export async function unmergeTeam(mergeId: string): Promise<UnmergePlan> {
  const plan = await planUnmerge(mergeId);
  const record = await db.query.teamMerges.findFirst({
    where: eq(teamMerges.id, mergeId),
  });
  const survivorId = record!.survivorId!;
  const team = reviveTimestamps(record!.team as Record<string, unknown>) as never;
  const moved = record!.moved as Moved;
  const dropped = record!.dropped as Dropped;

  /*
   * The redirects come off first. teams.slug is unique and the merge handed
   * this one to the survivor as a redirect; while it is still there the row
   * cannot be put back under its own address.
   */
  if (dropped.slugs.length > 0) {
    await db.delete(teamSlugs).where(inArray(teamSlugs.slug, dropped.slugs));
  }
  if (dropped.alias) {
    await db.delete(teamAliases).where(eq(teamAliases.alias, dropped.alias));
  }

  /*
   * The address may not be free any more, and the merge is what took it.
   *
   * A merge gives the survivor the best of the slugs in play — the bare one,
   * adopted from a loser when it shares the stem — so undoing that merge can
   * find a live team sitting at the address the absorbed row used to have.
   * Restoring it there would mean moving the survivor a second time, and the
   * survivor's address has been the public one ever since.
   *
   * So the row comes back at the next free number instead. Not the address it
   * left under, and said out loud rather than discovered: everything else
   * about the team — its fixtures, its entries, its facts — is restored.
   */
  const taken = await db.query.teams.findFirst({
    where: eq(teams.slug, plan.team.slug),
    columns: { id: true },
  });
  const slug = taken ? await uniqueTeamSlug(plan.team.slug) : plan.team.slug;
  await db.insert(teams).values({ ...(team as object), slug } as never);

  if (moved.matchesHome.length > 0) {
    await db
      .update(matches)
      .set({ homeTeamId: plan.team.id })
      .where(inArray(matches.id, moved.matchesHome));
  }
  if (moved.matchesAway.length > 0) {
    await db
      .update(matches)
      .set({ awayTeamId: plan.team.id })
      .where(inArray(matches.id, moved.matchesAway));
  }
  if (moved.eventTeams.length > 0) {
    await db
      .update(eventTeams)
      .set({ teamId: plan.team.id })
      .where(inArray(eventTeams.id, moved.eventTeams));
  }
  if (dropped.eventTeams.length > 0) {
    await db.insert(eventTeams).values(dropped.eventTeams.map(reviveTimestamps) as never);
  }
  if (moved.registrations.length > 0) {
    await db
      .update(eventRegistrations)
      .set({ teamId: plan.team.id })
      .where(inArray(eventRegistrations.id, moved.registrations));
  }
  if (dropped.registrations.length > 0) {
    await db
      .insert(eventRegistrations)
      .values(dropped.registrations.map(reviveTimestamps) as never);
  }
  if (moved.offers.length > 0) {
    await db
      .update(eventOffers)
      .set({ fromTeamId: plan.team.id })
      .where(inArray(eventOffers.id, moved.offers));
  }
  if (dropped.offers.length > 0) {
    await db.insert(eventOffers).values(dropped.offers.map(reviveTimestamps) as never);
  }
  if (moved.members.length > 0) {
    await db
      .update(teamMembers)
      .set({ teamId: plan.team.id })
      .where(
        and(
          eq(teamMembers.teamId, survivorId),
          inArray(teamMembers.userId, moved.members),
        ),
      );
  }

  await db
    .update(teamMerges)
    .set({ undoneAt: new Date() })
    .where(eq(teamMerges.id, mergeId));

  return plan;
}
