import "server-only";

import { generateText } from "ai";

import { db } from "@/db";
import { clubs, teamMatchSuggestions } from "@/db/schema";
import { clubContext } from "@/features/clubs/knowledge/store";

import { duplicateTeamGroups, proposedTeamMatches } from "../merge-queries";
import { pairOf } from "../match-plan";
import { isRateLimited } from "./rate-limit";
import {
  buildReviewPrompt,
  mergeDirection,
  parseVerdicts,
  REVIEW_SYSTEM,
  type ReviewPair,
} from "./review-prompt";

/**
 * Read every standing proposal, one club at a time, and say what it thinks.
 *
 * This is the step the rules cannot do. `proposedTeamMatches` is already as
 * sharp as facts can make it — same club, same cohort, same squad marks, one
 * name containing the other, and neither having played the other nor shared a
 * division. What is left is 259 pairs whose answer depends on knowing how a
 * particular club is organised, which is why the club's own website was read
 * first and why the profile goes into the prompt.
 *
 * It writes recommendations, and only recommendations. Accepting one is still
 * a click by a person on the admin page, and nothing here touches the merge,
 * the rename or the binder: the dry run is the only check on a rewrite, and a
 * dry run against a model's opinion checks nothing.
 */

const MODEL = process.env.TEAM_REVIEW_MODEL ?? "openai/gpt-4o-mini";

/** Per club, per call. Beyond this the answers start going missing. */
const BATCH = 12;

export type ReviewOutcome = {
  /** Pairs put in front of the model. */
  reviewed: number;
  same: number;
  different: number;
  unsure: number;
  /** Rows written to the queue: the "same" verdicts that were not already there. */
  written: number;
  /**
   * Every "same" verdict with the names it is about, so a run can be read
   * before it is believed.
   *
   * Populated on a dry run and on a real one alike: the queue shows the same
   * thing afterwards, but the first pass of a model over a whole backlog is
   * the one worth looking at in a terminal before it lands anywhere.
   */
  proposed: { a: string; b: string; why: string }[];
  /**
   * Every verdict, including the refusals, on a dry run.
   *
   * A run that reports "40 of 41 are two teams" and shows only the one it
   * agreed with cannot be judged: a model that answers "different" to
   * everything scores exactly the same. The refusals are where a prompt goes
   * wrong, so they are the half worth reading.
   */
  verdicts: { a: string; b: string; verdict: string; why: string }[];
  skipped?: string;
  stoppedEarly?: string;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function reviewProposals(
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<ReviewOutcome> {
  const empty = {
    reviewed: 0, same: 0, different: 0, unsure: 0, written: 0, proposed: [], verdicts: [],
  };
  if (!process.env.AI_GATEWAY_API_KEY) {
    return { ...empty, skipped: "AI_GATEWAY_API_KEY is not set." };
  }

  /*
   * Minus the pairs the exact finder already offers. Those are rows the
   * platforms spelled identically, which needs no judgement and would be a
   * model's easiest and least useful answer — and the admin page is already
   * asking about them under a different heading.
   */
  const grouped = new Map<string, string>();
  for (const g of await duplicateTeamGroups()) {
    for (const member of [g.survivor, ...g.losers]) grouped.set(member.id, g.survivor.id);
  }

  /*
   * Minus the pairs the club's own published naming already separates. Not
   * dropped from the database and not hidden — the admin page shows them
   * under their reason — simply not worth a model's opinion when the club has
   * already answered in writing.
   */
  const proposals = (await proposedTeamMatches(grouped)).filter((p) => !p.separatedBy);
  if (proposals.length === 0) return { ...empty, skipped: "Nothing proposed." };

  const clubNames = new Map(
    (await db.select({ id: clubs.id, slug: clubs.slug, name: clubs.name }).from(clubs)).map((c) => [
      c.id,
      c,
    ]),
  );

  /*
   * Grouped by club, because a club's pairs all turn on the same few facts.
   * Asked pair by pair, the profile would be paid for once per pair; asked
   * twelve at a time it is paid for once per twelve.
   */
  const byClub = new Map<string, typeof proposals>();
  for (const p of proposals) {
    const clubId = p.a.clubId;
    if (!clubId) continue;
    byClub.set(clubId, [...(byClub.get(clubId) ?? []), p]);
  }

  const held = new Map(
    proposals.map((p) => [pairOf(p.a.id, p.b.id), p] as const),
  );

  const verdicts = [];
  let reviewed = 0;
  let stoppedEarly: string | undefined;
  const cap = options.limit ?? 400;

  outer: for (const [clubId, clubProposals] of byClub) {
    const club = clubNames.get(clubId);
    if (!club) continue;

    for (const batch of chunk(clubProposals, BATCH)) {
      if (reviewed >= cap) {
        stoppedEarly = `Stopped at the ${cap}-pair limit; re-run for the rest.`;
        break outer;
      }

      const pairs: ReviewPair[] = batch.map((p) => ({
        key: pairOf(p.a.id, p.b.id),
        a: { name: p.a.name, events: p.a.events, matches: p.a.matches },
        b: { name: p.b.name, events: p.b.events, matches: p.b.matches },
      }));

      try {
        const { text } = await generateText({
          model: MODEL,
          system: REVIEW_SYSTEM,
          prompt: buildReviewPrompt(
            { name: club.name, context: clubContext(club.slug) },
            pairs,
          ),
          // Same pairs, same answer, so a nightly run does not churn the queue.
          temperature: 0,
        });
        reviewed += pairs.length;
        verdicts.push(...parseVerdicts(text, new Set(pairs.map((p) => p.key))));
      } catch (error) {
        /*
         * One failed call must not throw away the answers already paid for.
         * A rate limit will not clear within this run, so there is nothing to
         * gain by asking again; everything answered so far is still written.
         */
        stoppedEarly = isRateLimited(error)
          ? `Rate-limited after ${reviewed} pair(s). Re-run to continue; ` +
            "the free gateway tier is account-wide and small."
          : `Stopped after ${reviewed} pair(s): ${
              error instanceof Error ? error.message.slice(0, 120) : "unknown error"
            }`;
        break outer;
      }

      await pause(300);
    }
  }

  let written = 0;
  const proposed: ReviewOutcome["proposed"] = [];
  const readable: ReviewOutcome["verdicts"] = verdicts.flatMap((v) => {
    const p = held.get(v.key);
    return p ? [{ a: p.a.name, b: p.b.name, verdict: v.verdict, why: v.why }] : [];
  });

  for (const v of verdicts) {
    if (v.verdict !== "same") continue;
    const proposal = held.get(v.key);
    if (!proposal) continue;

    const { thin, thick } = mergeDirection(proposal.a, proposal.b);
    proposed.push({ a: thin.name, b: thick.name, why: v.why });

    // A dry run asks the same questions and answers to the terminal instead.
    if (options.dryRun) continue;

    await db
      .insert(teamMatchSuggestions)
      .values({
        newTeamId: thin.id,
        existingTeamId: thick.id,
        confidence: "medium",
        why: v.why || "read as one team from the club's own naming",
        model: MODEL,
      })
      // A standing suggestion stands. Re-writing it nightly would move it back
      // to the top of a queue somebody is working down.
      .onConflictDoNothing();
    written++;
  }

  return {
    proposed,
    verdicts: options.dryRun ? readable : [],
    reviewed,
    same: verdicts.filter((v) => v.verdict === "same").length,
    different: verdicts.filter((v) => v.verdict === "different").length,
    unsure: verdicts.filter((v) => v.verdict === "unsure").length,
    written,
    stoppedEarly,
  };
}
