/**
 * The two things a club team's name says beyond its club, age and gender.
 *
 * They matter because neither is decoration: 48 groups of teams here share a
 * club, birth years and gender, and what separates them is the tier. Without
 * it, "Crossfire, boys, 2009/2010" names three different sides.
 *
 *   tier     where the team plays — ECNL 1, RCL 2, MLS Next, Gold
 *   program  the club's own stream — Select, Academy, Premier, or the branch
 *            a big club runs it through: Seattle United's Shoreline, South
 *            and Northwest are that club's select teams under another name
 *
 * Read from the published name and never invented. A club that names neither
 * gets neither, which is most of them: 299 of 617 club teams state no tier.
 */

/**
 * Tiers, longest first so "ECNL RL" is not read as "ECNL".
 *
 * Every one appears in the imports. The canonical spelling is what gets
 * stored, so "RCL1", "RCL 1" and "rcl 1" all become "RCL 1" and a directory
 * can group by it.
 */
const TIERS: [RegExp, string][] = [
  [/\bpre[-\s]?mls\s*next\b/i, "Pre-MLS Next"],
  [/\bmls\s*next\b/i, "MLS Next"],
  // "ENCL" is the organizers' own typo, on four teams in production and
  // seven in dev. Ignoring it would leave those sides with no tier at all.
  [/\be[nc]{2}l[-\s]*rl\b/i, "ECNL RL"],
  [/\becrl\b/i, "ECNL RL"],
  [/\bpre[-\s]?ecnl\b/i, "Pre-ECNL"],
  [/\be[nc]{2}l\s*([12])\b/i, "ECNL $1"],
  [/\be[nc]{2}l\b/i, "ECNL"],
  [/\brcl\s*([1-4])\b/i, "RCL $1"],
  [/\brcl\b/i, "RCL"],
  [/\bnpl\b/i, "NPL"],
  [/\bea\s*([12])\b/i, "EA $1"],
  [/\bea\b/i, "EA"],
  [/\bn1\b/i, "National 1"],
  [/\bgold\b/i, "Gold"],
  [/\boro\b/i, "Gold"],
  [/\bsilver\b/i, "Silver"],
  [/\bbronze\b/i, "Bronze"],
];

/** The tier a name states, in its canonical spelling, or null. */
export function parseTier(name: string): string | null {
  for (const [pattern, label] of TIERS) {
    const m = pattern.exec(name);
    if (m) return label.replace("$1", m[1] ?? "");
  }
  return null;
}

/** Streams a club runs that are not a competitive tier. */
const PROGRAMS: [RegExp, string][] = [
  [/\bselect\b/i, "Select"],
  [/\bacademy\b/i, "Academy"],
  [/\bpremier\b/i, "Premier"],
];

/**
 * Branches, which only mean anything inside the club that runs them.
 *
 * "NW" is Seattle United's Northwest branch and is also the whole of NW
 * United, a different club; "South" is a Seattle United branch and also the
 * start of South Kitsap Soccer Club. So a branch is only read when the team
 * is already filed under the club that has it, which is why this takes the
 * club rather than guessing from the name alone.
 */
const BRANCHES: Record<string, [RegExp, string][]> = {
  "seattle-united": [
    [/\bshoreline\b/i, "Shoreline"],
    [/\bnorthwest\b|\bnw\b/i, "Northwest"],
    [/\bsouth\b/i, "South"],
  ],
};

/**
 * The club's own stream for this team, or null.
 *
 * A branch wins over a generic word: "Seattle United Shoreline Premier" is a
 * Shoreline team, and Shoreline is what tells it from the club's other sides.
 */
export function parseProgram(name: string, clubSlug: string | null): string | null {
  for (const [pattern, label] of BRANCHES[clubSlug ?? ""] ?? []) {
    if (pattern.test(name)) return label;
  }
  for (const [pattern, label] of PROGRAMS) {
    if (pattern.test(name)) return label;
  }
  return null;
}
