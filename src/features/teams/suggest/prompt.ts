/**
 * What we ask a model about teams the rules could not match.
 *
 * The deterministic matcher gets from 1,625 candidate pairs down to 180 good
 * ones using facts it can check. What it cannot do is know that "Little
 * Warriors" is Warriors' junior programme, or that a club rebranded — world
 * knowledge, which is the one thing a model is genuinely better at than a
 * regular expression.
 *
 * So it is asked only about the residue, and only to suggest. Its answer is
 * rows in a queue a person reads, never a merge.
 */

export type SuggestTeam = {
  id: string;
  name: string;
  club: string | null;
  birthYears: number[];
  gender: string | null;
  tier: string | null;
  events: string[];
};

/** A short, stable line per team — the model sees facts, not our schema. */
function describe(t: SuggestTeam): string {
  const bits = [
    t.club ? `club ${t.club}` : "club unknown",
    t.birthYears.length ? `born ${t.birthYears.join("/")}` : "birth years unknown",
    t.gender ?? "gender unknown",
    t.tier ?? null,
    `played ${t.events.join(", ") || "nothing yet"}`,
  ].filter(Boolean);
  return `- ${t.id} | ${t.name} | ${bits.join(" | ")}`;
}

export const SYSTEM_PROMPT = [
  "You match youth soccer team records that describe the same real team.",
  "Two records are the same team only if a parent would say so: same club, same age group, same squad.",
  "A club's A team is not its B team. Its second squad, marked II or -2, is not its first.",
  "A club's ECNL side is not its RCL side. Different birth years are different children.",
  "Prefer saying nothing. A wrong match merges two real teams' histories and cannot be undone.",
].join(" ");

/**
 * The question, with the unmatched teams and everything they might be.
 *
 * Ids are ours and opaque to the model; it returns them, and the parser
 * checks every one against what was sent, so a hallucinated id cannot reach
 * the database.
 */
export function buildPrompt(unmatched: SuggestTeam[], candidates: SuggestTeam[]): string {
  return [
    "Which of these newly imported teams are the same team as one already known?",
    "",
    "NEWLY IMPORTED:",
    ...unmatched.map(describe),
    "",
    "ALREADY KNOWN:",
    ...candidates.map(describe),
    "",
    'Answer with JSON only: {"matches":[{"newId":"...","existingId":"...","confidence":"high|medium","why":"one short sentence"}]}',
    'Return {"matches":[]} if none of them are the same team. Do not guess.',
  ].join("\n");
}

/**
 * The handful of teams one import might already be.
 *
 * Asking about forty teams against the whole directory cost 66,460 input
 * tokens and produced an empty answer: a thousand candidates in one prompt is
 * not a question, it is a haystack. The same question against seven
 * candidates costs 563 tokens and gets a considered reply.
 *
 * Ranked by the words the two names share, once the club's own words are
 * discounted — the club is usually all they share, and it is the rest that
 * decides.
 */
export function shortlist(
  team: SuggestTeam,
  candidates: SuggestTeam[],
  limit = 12,
): SuggestTeam[] {
  const GENERIC = new Set([
    "fc", "sc", "select", "academy", "premier", "boys", "girls", "united",
    "club", "soccer",
  ]);
  const words = (v: string) =>
    new Set(
      v
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1 && !GENERIC.has(w)),
    );

  const mine = words(team.name);
  const scored = candidates.flatMap((c) => {
    if (c.id === team.id) return [];
    const theirs = words(c.name);
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    // Same club counts for something even when the names share nothing:
    // that is how a rebranded side stays in view.
    const sameClub = team.club && c.club && team.club === c.club ? 1 : 0;
    const score = shared + sameClub;
    return score > 0 ? [{ c, score }] : [];
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);
}
