"use server";

import { and, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { searchTerms } from "@/features/search/terms";
import { clubs, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { formatBirthYears } from "@/features/teams/age";
import { mergeTeams } from "@/features/teams/merge";

export type TeamHit = {
  id: string;
  slug: string;
  name: string;
  detail: string;
};

/**
 * Find a team by name, for an admin who already knows which two are one.
 *
 * The queue proposes what the rules and a model can see. This is for
 * everything they cannot: a coach saying two rows are the same side, a club's
 * junior programme under another name, a rebrand nobody has written down yet.
 */
export async function searchTeamsToMerge(query: string): Promise<TeamHit[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return [];

  const q = query.trim();
  if (q.length < 2) return [];
  const terms = searchTerms(q);

  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      birthYears: teams.birthYears,
      gender: teams.gender,
      tier: teams.tier,
      club: clubs.name,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .where(and(...terms.map((term) => or(ilike(teams.name, term), ilike(teams.slug, term)))))
    .limit(12);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    // Everything that decides whether two rows are one team, on one line, so
    // the choice is made from facts rather than from a name that looks close.
    detail:
      [r.club, formatBirthYears(r.birthYears), r.gender, r.tier]
        .filter(Boolean)
        .join(" · ") || "no club, no age group recorded",
  }));
}

export type ManualMergeResult = { error?: string; detail?: string };

/**
 * Merge two teams an admin picked themselves.
 *
 * The survivor is chosen explicitly rather than inferred: the queue's
 * heuristics — most matches, most events — are a reasonable guess when
 * nobody has looked, and beside the point when somebody has.
 */
export async function mergeChosenTeams(
  keepId: string,
  foldId: string,
): Promise<ManualMergeResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (!keepId || !foldId) return { error: "Pick both teams." };
  if (keepId === foldId) return { error: "That is the same team twice." };

  try {
    const out = await mergeTeams(keepId, [foldId], user.id);
    return {
      detail:
        `Merged into ${out.survivorSlug} — ${out.matchesMoved} match(es) moved` +
        (out.entriesDropped > 0
          ? `, ${out.entriesDropped} duplicate entr${out.entriesDropped === 1 ? "y" : "ies"} dropped`
          : "") +
        ". The folded-in name now points here on future imports.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Merge failed." };
  }
}
