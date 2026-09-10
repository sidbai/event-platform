import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { clubAliases, clubs } from "@/db/schema";

import { aliasKey, clubIndex, matchClub } from "./matching";

/**
 * Recording that a club is also called something.
 *
 * The matcher reaches a club through the words of its name, so a form that
 * shares none of them is unreachable: Three Rivers Soccer Club enters the
 * Regional Club League as "3RSC BU13 RCL Lee", and seven teams would have
 * landed under no club at all.
 *
 * Aliases existed already — the merge flow writes one when an admin says two
 * names are the same team, which is why this club already answers to
 * "3rscecnl" from an ECNL import. What was missing was any way to write one
 * down on purpose, without first having the teams it would have misfiled.
 *
 * Stored normalised, the way the index keys are, so "3RSC" and "3 R S C" are
 * one alias and the caller does not have to know that.
 */

export type AliasPlan = {
  club: { id: string; name: string; slug: string };
  alias: string;
  /** Already recorded, against this club or another one. */
  heldBy: { name: string; slug: string } | null;
  /** The club the matcher reaches for this text today, if any. */
  reaches: { name: string; slug: string } | null;
};

export async function planAlias(clubSlug: string, text: string): Promise<AliasPlan | null> {
  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, clubSlug),
    columns: { id: true, name: true, slug: true },
  });
  if (!club) return null;

  const alias = aliasKey(text);
  const all = await db.select({ id: clubs.id, name: clubs.name, slug: clubs.slug }).from(clubs);
  const byId = new Map(all.map((c) => [c.id, c]));

  const existing = await db.query.clubAliases.findFirst({
    where: eq(clubAliases.alias, alias),
    columns: { clubId: true },
  });

  const aliasRows = await db.select().from(clubAliases);
  const index = clubIndex(all.map((c) => ({ id: c.id, name: c.name })));
  const match = matchClub(text, new Map(aliasRows.map((a) => [a.alias, a.clubId])), index);

  return {
    club,
    alias,
    heldBy: existing ? (byId.get(existing.clubId) ?? null) : null,
    reaches: match ? (byId.get(match.clubId) ?? null) : null,
  };
}

/**
 * Never over the top of another club's alias.
 *
 * Moving one silently is how a club quietly acquires somebody else's teams on
 * the next import, and the two clubs it would be between are exactly the two
 * a person needs to look at.
 */
export async function recordAlias(plan: AliasPlan): Promise<void> {
  if (plan.heldBy && plan.heldBy.slug !== plan.club.slug) {
    throw new Error(`"${plan.alias}" already belongs to ${plan.heldBy.name}`);
  }
  await db
    .insert(clubAliases)
    .values({ alias: plan.alias, clubId: plan.club.id })
    .onConflictDoNothing();
}
