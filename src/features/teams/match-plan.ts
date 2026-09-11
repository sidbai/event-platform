import { vocabularyFor } from "@/features/clubs/knowledge/store";
import { namedApart } from "@/features/clubs/knowledge/vocabulary";

import { sameCohort } from "./age";
import { normaliseTeamName } from "./merge-plan";

/**
 * Pairs of rows that look like one team, for a person to confirm.
 *
 * The exact finder — same source id, same name — only ever catches what the
 * platforms spelled identically. It cannot see that "LWPFC B17/18 White
 * Sharks" and "LWPFC White Sharks B17/18" are one side, which is the case
 * that keeps the queue refilling after every tournament.
 *
 * So: propose within a club, and let the facts rule pairs out rather than in.
 * Measured against the directory, club and gender alone give 1,625 pairs —
 * useless. The rules below cut that to 74, and the ones they remove are the
 * ones that would have been wrong: a club's A side is not its B side.
 *
 * Nothing here merges. Every pair goes in front of somebody, because a merge
 * cannot be undone.
 */

export type MatchCandidate = {
  id: string;
  slug: string;
  name: string;
  clubId: string | null;
  /**
   * The club's slug, which is how the knowledge base is keyed.
   *
   * Carried beside `clubId` rather than looked up, so this module stays a
   * pure function of what it is handed — the same reason `clubNameById` is
   * passed in rather than queried.
   */
  clubSlug?: string | null;
  gender: string | null;
  birthYears: number[];
  tier: string | null;
  events: number;
  matches: number;
};

export type MatchProposal = {
  a: MatchCandidate;
  b: MatchCandidate;
  /** 0–1, how much of the two names is shared once the club is discounted. */
  score: number;
  because: string;
};

const GENERIC = new Set([
  "fc", "sc", "select", "academy", "premier", "boys", "girls", "united",
  "club", "soccer",
]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The marks a club uses to tell its own sides apart.
 *
 * A lone A–D, a Roman numeral, or a trailing -2. Without these, "Crossfire
 * Select BU19 A" and "BU19 B" score half their words in common and read as a
 * duplicate; with them, 47 such pairs are refused. "Seattle Reign Academy
 * U11-2" and "U11-3" are the same trap wearing digits.
 */
export function squadMarks(name: string): Set<string> {
  const lower = name.toLowerCase();
  const marks = new Set<string>();
  for (const m of lower.matchAll(/(?<![a-z0-9])([a-d])(?![a-z0-9])/g)) {
    marks.add(m[1].toUpperCase());
  }
  for (const m of lower.matchAll(/(?<![a-z])(iv|iii|ii)(?![a-z])/g)) {
    marks.add(m[1].toUpperCase());
  }
  for (const m of lower.matchAll(/(?<=[a-z0-9])-([1-9])(?![0-9])/g)) {
    marks.add(m[1]);
  }
  /*
   * And a number standing on its own, which is how most clubs write it:
   * "Mt. Rainier FC Academy B11/12 2" is that club's second side and the 2 is
   * the whole of what says so — but it was invisible here (only a hyphenated
   * one counted) and invisible to distinctiveWords too, which drops anything
   * one character long. So the second side and the first read as one team at
   * a hundred per cent, and 143 of 534 proposals were that.
   *
   * Not a digit inside a cohort: the lookbehind refuses one after a slash or
   * a letter, so B11/12 contributes nothing.
   */
  for (const m of lower.matchAll(/(?<![a-z0-9/-])([1-9])(?![0-9])/g)) {
    marks.add(m[1]);
  }
  return marks;
}

/** A name's words, minus its club's and minus what every team says. */
function distinctiveWords(name: string, clubName: string | null): Set<string> {
  const club = new Set(clubName ? words(clubName) : []);
  return new Set(
    words(name).filter((w) => w.length > 1 && !club.has(w) && !GENERIC.has(w)),
  );
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((v) => b.has(v));

/**
 * A stable key for two ids, in either order.
 *
 * Its own function because the same pair is keyed in three places — here, the
 * SQL that finds pairs the fixtures rule out, and the dismissal list — and a
 * key that disagrees with itself silently stops ruling anything out.
 */
export function pairOf(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Why these two cannot be one team, or null if nothing rules it out.
 *
 * Exported because the reasons are the interesting part: each one was a false
 * positive in the directory before it became a rule.
 */
export function whyNot(
  a: MatchCandidate,
  b: MatchCandidate,
  /** Removed before the club's own words are looked for; see `namedApart`. */
  clubName?: string | null,
): string | null {
  if (a.clubId === null || a.clubId !== b.clubId) return "different clubs";
  if (a.gender && b.gender && a.gender !== b.gender) return "different genders";

  /*
   * The same rule the binder uses, and for the same reason: a club's U13 side
   * and its U14 side share a year, so asking whether they share one offered
   * every club its own age group as a duplicate to merge. Somebody took one
   * of those offers.
   */
  if (a.birthYears.length > 0 && b.birthYears.length > 0) {
    if (!sameCohort(a.birthYears, b.birthYears)) return "different birth years";
  }
  if (a.tier && b.tier && a.tier !== b.tier) return "different tiers";

  /*
   * What the club itself says about its own names.
   *
   * The rules above are general — a lone A or B, a Roman numeral, a trailing
   * digit — and general rules cannot know that at Eastside FC a colour is a
   * tier, that Seattle United's Northwest and South are different regions, or
   * that Mt. Rainier's Academy and Premier are separate programmes a player
   * is placed into by tryout. All three are published by the club, and all
   * three were pairs this queue kept offering.
   *
   * Silent for a club nothing has been read about, which is most of the small
   * ones: it can only ever rule a pair out.
   */
  const vocabulary = vocabularyFor(a.clubSlug);
  if (vocabulary) {
    const apart = namedApart(vocabulary, a.name, b.name, clubName);
    if (apart) return apart;
  }

  const [ma, mb] = [squadMarks(a.name), squadMarks(b.name)];
  if (ma.size > 0 || mb.size > 0) {
    // One side marked and the other not is not evidence of sameness either:
    // "BU19 A" beside "BU19" may be the first team or a different one.
    if (!sameSet(ma, mb)) return "different squads";
  }
  return null;
}

/**
 * Ranked pairs worth asking about, most alike first.
 *
 * `threshold` is how much of the two names must agree. At 0.5 the directory
 * yields 74 pairs; lower and it starts offering a club's whole age group.
 */
export function proposeMatches(
  candidates: MatchCandidate[],
  clubNameById: Map<string, string>,
  /**
   * Pairs the fixture list already proves are two teams.
   *
   * Keyed by `pairOf`. Empty is a valid answer and simply means nothing was
   * looked up — the rule can only ever remove pairs, never add one.
   */
  apart: ReadonlySet<string> = new Set(),
  threshold = 0.5,
): MatchProposal[] {
  const byClub = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    if (!c.clubId) continue;
    byClub.set(c.clubId, [...(byClub.get(c.clubId) ?? []), c]);
  }

  const out: MatchProposal[] = [];
  for (const [clubId, group] of byClub) {
    const clubName = clubNameById.get(clubId) ?? null;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (apart.has(pairOf(a.id, b.id))) continue;
        if (whyNot(a, b, clubName)) continue;

        const wa = distinctiveWords(a.name, clubName);
        const wb = distinctiveWords(b.name, clubName);
        if (wa.size === 0 || wb.size === 0) continue;

        /*
         * One name is the other with more said, or they are two teams.
         *
         * Overlap alone put "Eastside FC B14/15 Red" beside "…B14/15 Grey" at
         * exactly the threshold: everything matches but the one word whose
         * whole job is to tell them apart. Same for Copper against Silver,
         * STINGRAYS against Barracuda, and Seattle United's Northwest against
         * its South.
         *
         * A pair worth asking about is one where a side says nothing the
         * other contradicts — "NW United FC B17/18" and "NW United FC B17/18
         * Red" are one team written twice. Where each carries a word the
         * other lacks, the club is telling them apart and we should listen.
         */
        const contains = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
        if (!contains(wa, wb) && !contains(wb, wa)) continue;

        const shared = [...wa].filter((w) => wb.has(w)).length;
        const score = shared / new Set([...wa, ...wb]).size;
        if (score < threshold) continue;

        out.push({
          a,
          b,
          score,
          because:
            normaliseTeamName(a.name) === normaliseTeamName(b.name)
              ? "the same name"
              : `${Math.round(score * 100)}% of the name, same club and age group`,
        });
      }
    }
  }
  // Most alike first, then the pair carrying the most history, so the ones
  // worth getting right are read first.
  return out.sort(
    (x, y) => y.score - x.score || y.a.matches + y.b.matches - (x.a.matches + x.b.matches),
  );
}
