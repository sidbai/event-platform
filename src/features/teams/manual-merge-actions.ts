"use server";

import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { searchTerms, startsWord } from "@/features/search/terms";
import { clubs, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { formatBirthYears } from "@/features/teams/age";
import { mergeTeams } from "@/features/teams/merge";
import { whyNot, type MatchCandidate } from "@/features/teams/match-plan";
import { vocabularyFor } from "@/features/clubs/knowledge/store";
import { namedApart } from "@/features/clubs/knowledge/vocabulary";

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
    .where(and(...terms.map((term) => or(startsWord(teams.name, term), startsWord(teams.slug, term)))))
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

export type ManualMergeResult = {
  error?: string;
  detail?: string;
  /** The rules say these are two teams; the person may still say otherwise. */
  warning?: string;
};

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
  /** The person has read the warning and still wants the merge. */
  force = false,
): Promise<ManualMergeResult> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Not allowed." };
  if (!keepId || !foldId) return { error: "Pick both teams." };
  if (keepId === foldId) return { error: "That is the same team twice." };

  /*
   * The same rules the queue applies, said before the merge rather than
   * discovered after it. "Seattle United B14 Copa" was folded into the
   * Pre-ECNL side from here; the club's own site says those are two tiers,
   * the import path knew it, and this form asked nothing. A warning with an
   * override, because the person may know something the rules do not.
   */
  if (!force) {
    const reason = await twoTeams(keepId, foldId);
    if (reason) return { warning: reason };
  }

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

/** Why the rules think these are two teams, or null. */
async function twoTeams(aId: string, bId: string): Promise<string | null> {
  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      clubId: teams.clubId,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      gender: teams.gender,
      birthYears: teams.birthYears,
      tier: teams.tier,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .where(inArray(teams.id, [aId, bId]));
  const a = rows.find((r) => r.id === aId);
  const b = rows.find((r) => r.id === bId);
  if (!a || !b) return null;
  const candidate = (r: typeof a): MatchCandidate => ({ ...r, events: 0, matches: 0 });
  const general = whyNot(candidate(a), candidate(b));
  // "different clubs" also fires when one side has no club — a fact to see, not a rule to stop on.
  if (general && general !== "different clubs") return general;
  const vocabulary = vocabularyFor(a.clubSlug ?? b.clubSlug);
  if (!vocabulary) return null;
  const apart = namedApart(vocabulary, a.name, b.name, a.clubName ?? b.clubName);
  return apart ? `${a.clubName ?? "the club"}'s own site says these are two teams (${apart})` : null;
}
