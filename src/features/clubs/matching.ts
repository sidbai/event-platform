/**
 * Working out which club an imported team belongs to.
 *
 * A connector gets a team's name and nothing else: "XF, U14, B12 - 13, RCL 1,
 * Plackov" is a Crossfire team, and so is "Crossfire Select B-U10C Quadracci",
 * and neither string contains the club's name as the directory spells it
 * ("Crossfire Premier"). Names are also the only thing there is — no ids, no
 * club field, nothing the platform hands over.
 *
 * So: match on the leading words, which is where the club is in every naming
 * convention in the data, and let a person confirm anything that is not an
 * alias somebody already approved. Nothing here writes; it proposes.
 */

/**
 * A word this cannot identify a club by on its own.
 *
 * "United" leads United Sports FC, Snohomish United, Northwest United and NW
 * United; "Seattle" leads five clubs. Matching a team called "United PDX" to
 * United Sports FC because both start with "united" is not a near miss, it is
 * a different club in a different state.
 */
const GENERIC = new Set([
  "fc", "sc", "cf", "afc", "soccer", "club", "academy", "premier", "select",
  "youth", "alliance", "association", "sports", "seattle", "washington",
  "north", "south", "east", "west", "northwest", "northeast", "southwest",
  "southeast", "greater", "united", "city", "the",
]);

/** Words, lowercased, with punctuation and spacing thrown away. */
export function words(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The key an alias is stored under: letters and digits only, lowercased. */
export function aliasKey(name: string): string {
  return words(name).join("");
}

/**
 * The keys a name could be filed under, longest first.
 *
 * "Seattle United - South B15 Blue" offers seattleunitedsouthb15,
 * seattleunitedsouth, seattleunited, seattle — so an alias for the affiliate
 * wins over one for the parent club, and both beat the bare city.
 *
 * Only the first four words: past that the string is describing the team's age
 * group and coach, not the club.
 */
export function candidateKeys(name: string, maxWords = 4): string[] {
  const w = words(name);
  const keys: string[] = [];
  for (let i = Math.min(maxWords, w.length); i > 0; i--) {
    keys.push(w.slice(0, i).join(""));
  }
  return keys;
}

export type ClubRef = { id: string; name: string };

export type ClubMatch = {
  clubId: string;
  /** The key that matched, which is the alias worth saving if confirmed. */
  key: string;
  /**
   * Whether a person has already vouched for this.
   *
   * "alias" was approved by an admin and can be applied without asking again.
   * "name" is this code noticing the team's first words are a club's first
   * words, which is a proposal and nothing more.
   */
  because: "alias" | "name";
};

/**
 * Keys that identify exactly one club, built from the club list.
 *
 * A key two clubs answer to identifies neither, so it is dropped rather than
 * awarded to whichever sorted first — "North Kitsap" and "Northlake" both
 * being reachable as "north" is a reason to ask, not to guess.
 */
export function clubIndex(clubs: ClubRef[]): Map<string, string> {
  const claims = new Map<string, Set<string>>();
  for (const club of clubs) {
    const w = words(club.name);
    for (let i = w.length; i > 0; i--) {
      const key = w.slice(0, i).join("");
      // A key made only of words like "seattle united" describes a dozen
      // clubs; the full name is kept regardless, since that is the club.
      const distinctive = i === w.length || w.slice(0, i).some((x) => !GENERIC.has(x));
      if (key.length < 3 || !distinctive) continue;
      const held = claims.get(key) ?? new Set<string>();
      held.add(club.id);
      claims.set(key, held);
    }
  }
  const index = new Map<string, string>();
  for (const [key, ids] of claims) {
    if (ids.size === 1) index.set(key, [...ids][0]);
  }
  return index;
}

/**
 * The club a team name points at, or null when nothing does.
 *
 * Aliases are consulted first and at every length, because an alias is a
 * decision somebody made and a name match is a guess this code made.
 */
export function matchClub(
  teamName: string,
  aliases: Map<string, string>,
  index: Map<string, string>,
): ClubMatch | null {
  const keys = candidateKeys(teamName);
  for (const key of keys) {
    const clubId = aliases.get(key);
    if (clubId) return { clubId, key, because: "alias" };
  }
  for (const key of keys) {
    const clubId = index.get(key);
    if (clubId) return { clubId, key, because: "name" };
  }
  return null;
}
