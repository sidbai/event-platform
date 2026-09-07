import "server-only";

import { generateText } from "ai";
import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clubs, teamAliases, teamMatchSuggestions, teams } from "@/db/schema";

import { buildPrompt, SYSTEM_PROMPT, type SuggestTeam } from "./prompt";
import { parseSuggestions } from "./parse";

/**
 * Ask a model about the teams the rules could not place.
 *
 * Deliberately not part of the sync. A tournament import must not fail, slow
 * down, or cost money because somebody else's API is having an afternoon —
 * so this runs after, on demand, and writes suggestions a person reads.
 *
 * The model is reached through Vercel's AI Gateway, which is why there is no
 * provider SDK here: with AI_GATEWAY_API_KEY set, "openai/gpt-4o-mini" and
 * friends resolve on their own.
 */

const MODEL = process.env.TEAM_MATCH_MODEL ?? "openai/gpt-4o-mini";

export type SuggestOutcome = {
  asked: number;
  suggested: number;
  skipped?: string;
};

/** Teams imported recently that nothing has matched to anything. */
async function unmatchedTeams(sinceHours: number): Promise<SuggestTeam[]> {
  const rows = await db.query.teams.findMany({
    where: and(
      isNotNull(teams.originEventId),
      sql`${teams.createdAt} > now() - (${sinceHours} || ' hours')::interval`,
    ),
    columns: {
      id: true,
      name: true,
      clubId: true,
      birthYears: true,
      gender: true,
      tier: true,
    },
    with: { eventTeams: { with: { event: { columns: { title: true } } } } },
  });
  return withClubNames(rows);
}

/** Everything else, as the pool a new team might already be. */
async function knownTeams(excludeIds: Set<string>): Promise<SuggestTeam[]> {
  const rows = await db.query.teams.findMany({
    columns: {
      id: true,
      name: true,
      clubId: true,
      birthYears: true,
      gender: true,
      tier: true,
    },
    with: { eventTeams: { with: { event: { columns: { title: true } } } } },
  });
  return withClubNames(rows.filter((r) => !excludeIds.has(r.id)));
}

type Row = {
  id: string;
  name: string;
  clubId: string | null;
  birthYears: number[];
  gender: string | null;
  tier: string | null;
  eventTeams: { event: { title: string } | null }[];
};

async function withClubNames(rows: Row[]): Promise<SuggestTeam[]> {
  const clubRows = await db.select({ id: clubs.id, name: clubs.name }).from(clubs);
  const byId = new Map(clubRows.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    club: r.clubId ? (byId.get(r.clubId) ?? null) : null,
    birthYears: r.birthYears,
    gender: r.gender,
    tier: r.tier,
    events: r.eventTeams.flatMap((e) => (e.event ? [e.event.title] : [])),
  }));
}

export async function suggestTeamMatches(
  options: { sinceHours?: number; limit?: number } = {},
): Promise<SuggestOutcome> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return { asked: 0, suggested: 0, skipped: "AI_GATEWAY_API_KEY is not set." };
  }

  const unmatched = (await unmatchedTeams(options.sinceHours ?? 48)).slice(
    0,
    options.limit ?? 40,
  );
  if (unmatched.length === 0) return { asked: 0, suggested: 0, skipped: "Nothing new." };

  const known = await knownTeams(new Set(unmatched.map((t) => t.id)));
  if (known.length === 0) return { asked: 0, suggested: 0, skipped: "Nothing to match against." };

  const { text } = await generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(unmatched, known),
    // Same question, same answer, so a re-run does not churn the queue.
    temperature: 0,
  });

  const suggestions = parseSuggestions(text, {
    newIds: new Set(unmatched.map((t) => t.id)),
    existingIds: new Set(known.map((t) => t.id)),
  });

  /*
   * A pair somebody already bound by hand is not a suggestion. The alias is
   * the record of that decision, and re-proposing it would ask an admin to
   * confirm what they confirmed last month.
   */
  const aliased = new Set(
    (await db.select({ teamId: teamAliases.teamId }).from(teamAliases)).map((r) => r.teamId),
  );

  let written = 0;
  for (const s of suggestions) {
    if (aliased.has(s.newId)) continue;
    await db
      .insert(teamMatchSuggestions)
      .values({
        newTeamId: s.newId,
        existingTeamId: s.existingId,
        confidence: s.confidence,
        why: s.why,
        model: MODEL,
      })
      .onConflictDoNothing();
    written++;
  }

  return { asked: unmatched.length, suggested: written };
}

/**
 * Standing suggestions, with the names they are about.
 *
 * The names come along because the page shows them: a queue of ids is not a
 * queue anyone can answer, and reading both names is the entire safeguard
 * between a guess and a merge.
 */
export async function openSuggestions() {
  const rows = await db.query.teamMatchSuggestions.findMany({
    where: and(
      isNull(teamMatchSuggestions.dismissedAt),
      isNull(teamMatchSuggestions.acceptedAt),
    ),
    orderBy: (t, { desc }) => [desc(t.confidence), desc(t.createdAt)],
    limit: 40,
  });
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((r) => [r.newTeamId, r.existingTeamId]))];
  const named = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .where(inArray(teams.id, ids));
  const byId = new Map(named.map((t) => [t.id, t]));

  return rows.flatMap((r) => {
    const a = byId.get(r.newTeamId);
    const b = byId.get(r.existingTeamId);
    // A team merged away since the suggestion was written has no row left,
    // and a suggestion about it has nothing to say.
    if (!a || !b) return [];
    return [{ ...r, newTeamName: a.name, newTeamSlug: a.slug, existingTeamName: b.name, existingTeamSlug: b.slug }];
  });
}
