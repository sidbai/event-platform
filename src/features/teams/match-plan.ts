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
 * Why these two cannot be one team, or null if nothing rules it out.
 *
 * Exported because the reasons are the interesting part: each one was a false
 * positive in the directory before it became a rule.
 */
export function whyNot(a: MatchCandidate, b: MatchCandidate): string | null {
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
        if (whyNot(a, b)) continue;

        const wa = distinctiveWords(a.name, clubName);
        const wb = distinctiveWords(b.name, clubName);
        if (wa.size === 0 || wb.size === 0) continue;

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
