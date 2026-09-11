/**
 * What we believe about how one club names and organises its teams.
 *
 * The gap this fills is specific and was paid for. An evening of import
 * failures were all one shape — a fact about a club that nothing recorded:
 * Atletico names its sides Azul, Rojo and Oro, and "Oro" was read as the tier
 * Gold; Seattle Celtic writes single-year cohorts where its leagues write
 * two-year bands; Western WA Surf fields a Premier side in nine different
 * towns, so "Surf Bellevue" and "Surf Tacoma" are not one team spelled twice.
 *
 * None of that is derivable from our rows. All of it is stated plainly on the
 * club's own website, which is where these come from.
 *
 * A profile is evidence for a person, never an instruction to the code. It is
 * read into the prompt that proposes merges and into nothing else: no rename,
 * no bind, no merge consults it, because the dry run is the only check on a
 * rewrite and a dry run against a guess checks nothing.
 */

export type ClubProfile = {
  slug: string;
  /** Ordered strongest first, as the club itself presents them. */
  tiers: string[];
  /**
   * Words that pick one squad out of several in the same age group.
   *
   * The distinction that matters: a *tier* word ranks two teams, a *squad*
   * word merely names them. Both look identical in a team name.
   */
  squadMarkers: string[];
  /** What a colour in a team name means at this club. */
  colours: "tier" | "squad" | "mixed" | "none" | "unknown";
  /** Whether this club writes one birth year or a two-year band. */
  ageBands: "single-year" | "two-year" | "both" | "unknown";
  /**
   * Programmes or places whose teams are genuinely separate sides.
   *
   * Surf's towns; a club's ECNL and RCL programmes. Two names differing only
   * by one of these are two teams, not one team twice.
   */
  branches: string[];
  coaches: ClubCoach[];
  /** A few sentences for a person to read, and for the merge prompt to carry. */
  summary: string;
  /** The pages this was read from, so a stale profile can be re-checked. */
  sources: string[];
  readAt: string;
  model: string;
};

export type ClubCoach = {
  name: string;
  /** "Director of Coaching", "Head Coach", whatever the page said. */
  role: string | null;
  /** What they coach, in the club's own words: "Boys 2013", "G09 ECNL". */
  ageGroups: string[];
};

export const EMPTY_PROFILE: Omit<ClubProfile, "slug" | "readAt" | "model"> = {
  tiers: [],
  squadMarkers: [],
  colours: "unknown",
  ageBands: "unknown",
  branches: [],
  coaches: [],
  summary: "",
  sources: [],
};

/**
 * Does this profile say anything worth keeping?
 *
 * A club whose site is a single JavaScript shell yields a profile of empty
 * arrays and "unknown". Writing that down is worse than writing nothing: it
 * reads in a diff like a finding, and in the prompt like a club that has no
 * tiers rather than one we failed to read.
 */
export function saysSomething(profile: ClubProfile): boolean {
  return (
    profile.tiers.length > 0 ||
    profile.branches.length > 0 ||
    profile.squadMarkers.length > 0 ||
    profile.coaches.length > 0 ||
    (profile.colours !== "unknown" && profile.colours !== "none") ||
    profile.ageBands !== "unknown"
  );
}

/**
 * The profile as the merge prompt sees it: short, and only the parts that
 * change an answer.
 *
 * Coaches are left out on purpose. They are worth collecting — a coach page
 * is how we learn a club has a "B09 Red" at all — but a coach's name never
 * decides whether two rows are one team, and forty names per club would crowd
 * out the six words that do.
 */
export function forPrompt(profile: ClubProfile): string {
  const bits: string[] = [];
  if (profile.tiers.length) bits.push(`tiers, strongest first: ${profile.tiers.join(" > ")}`);
  if (profile.branches.length) bits.push(`separate programmes or locations: ${profile.branches.join(", ")}`);
  if (profile.squadMarkers.length) bits.push(`squad markers: ${profile.squadMarkers.join(", ")}`);
  if (profile.colours === "squad") bits.push("a colour in a name is a squad, not a tier");
  if (profile.colours === "tier") bits.push("a colour in a name is a tier");
  if (profile.ageBands === "single-year") bits.push("writes one birth year, not a band");
  if (profile.ageBands === "two-year") bits.push("writes two-year bands");
  if (profile.summary) bits.push(profile.summary);
  return bits.join("; ");
}
