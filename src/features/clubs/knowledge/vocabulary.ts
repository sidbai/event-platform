import type { ClubProfile } from "./profile";

/**
 * A club's own words for telling its teams apart, as a rule rather than prose.
 *
 * The knowledge base is written for two readers. A person reads the summary;
 * this is the half a matcher can act on without asking anybody — and it is
 * the half that matters, because a deterministic rule can rule a pair out
 * before it ever reaches a queue, a model, or a person's afternoon.
 *
 * Two groups, kept apart on purpose. A club's *levels* rank its teams (ECNL
 * above Copa above Tango; Red above White) and its *branches* place them
 * (Shoreline, Northwest and South; EFC and VCF; Bellevue and Tacoma). One
 * flat list cannot express the case this exists for: "Seattle United
 * Northwest B13 Blue" and "Seattle United South B13 Blue" share the level and
 * differ in the branch, and are two teams. Intersecting one combined set finds
 * the shared Blue and calls it agreement.
 */

export type ClubVocabulary = {
  /** Words that say how strong a team is. */
  levels: string[];
  /** Words that say which programme or place a team belongs to. */
  branches: string[];
};

export function vocabularyOf(profile: ClubProfile): ClubVocabulary {
  const dedupe = (values: string[]) => [
    ...new Map(values.map((v) => [v.toLowerCase(), v])).values(),
  ];
  return {
    levels: dedupe([...profile.tiers, ...profile.squadMarkers]),
    branches: dedupe(profile.branches),
  };
}

function flatten(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/**
 * Which of these words the name carries.
 *
 * Matched as whole words in order, so "Red" is not found inside "Redmond" and
 * "West Maroon" is only found where the club actually wrote both.
 */
export function marksIn(name: string, words: string[]): Set<string> {
  const haystack = flatten(name);
  const out = new Set<string>();
  for (const word of words) {
    const needle = flatten(word);
    if (needle.trim() && haystack.includes(needle)) out.add(word.toLowerCase());
  }
  return out;
}

/**
 * Why the club's own naming says these are two teams, or null.
 *
 * Only ever rules out. A name that carries none of the club's words says
 * nothing — it is shorter, not different — so a group where either side is
 * silent is skipped rather than counted against the pair.
 *
 * `clubName` is removed first because a club whose name contains one of its
 * own level words would otherwise match it on every team it has: every
 * Crossfire Premier side carries "Premier", and the rule would be unable to
 * separate any of them.
 */
export function namedApart(
  vocabulary: ClubVocabulary,
  a: string,
  b: string,
  clubName?: string | null,
): string | null {
  const strip = (name: string) =>
    clubName ? name.replace(new RegExp(escapeRegExp(clubName), "ig"), " ") : name;
  const [nameA, nameB] = [strip(a), strip(b)];

  for (const [group, words] of [
    ["level", vocabulary.levels],
    ["programme", vocabulary.branches],
  ] as const) {
    const [ma, mb] = [marksIn(nameA, words), marksIn(nameB, words)];
    if (ma.size === 0 || mb.size === 0) continue;

    /*
     * The most specific word each side carries, and then the same test the
     * proposer uses on whole names: one must be the other said more fully.
     *
     * Any-overlap is not enough, and the case is Eastside's. "BU12 West
     * Maroon" and "BU12 West Red" both carry West, which an intersection
     * reads as agreement — but West is the training hub and the second word
     * is which team, so they are two sides. Meanwhile "West" beside "West
     * Red" is one team recorded twice, once in less detail, and ruling that
     * out would lose a merge somebody wants.
     */
    const most = (marks: Set<string>) =>
      [...marks].sort((x, y) => y.length - x.length)[0];
    const [ba, bb] = [most(ma), most(mb)];
    const encloses = (x: string, y: string) => ` ${y} `.includes(` ${x} `);
    if (!encloses(ba, bb) && !encloses(bb, ba)) {
      return `the club's own ${group}s: ${ba} is not ${bb}`;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
