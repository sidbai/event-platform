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
  //
  // Pre-ECNL RL before ECNL RL, or the Pre is read as a separate word and the
  // team is filed a division above where it plays.
  [/\bpre[-\s]?e[nc]{2}l[-\s/]*rl\b/i, "Pre-ECNL RL"],
  [/\be[nc]{2}l[-\s/]*rl\b/i, "ECNL RL"],
  [/\becrl\b/i, "ECNL RL"],
  [/\bpre[-\s]?ecnl\b/i, "Pre-ECNL"],
  [/\be[nc]{2}l[-\s]*([12])\b/i, "ECNL $1"],
  [/\be[nc]{2}l\b/i, "ECNL"],
  [/\brcl[-\s]*([1-4])\b/i, "RCL $1"],
  [/\brcl\b/i, "RCL"],
  [/\bnpl\b/i, "NPL"],
  [/\bpre[-\s]?ea\b/i, "Pre-EA"],
  [/\bea\s*([12])\b/i, "EA $1"],
  [/\bea\b/i, "EA"],
  [/\bn1\b|\bnational\s*1\b/i, "National 1"],
  [/\bpre[-\s]?ga\b|\bga[-\s]*aspire\b|\baspire\b/i, "Pre-GA"],
  [/\bga\b/i, "GA"],
  [/\bgold\b/i, "Gold"],
  [/\boro\b/i, "Gold"],
  [/\bsilver\b/i, "Silver"],
  [/\bbronze\b/i, "Bronze"],
];

/**
 * Colours, which a club uses for exactly what a tier is for.
 *
 * "Seattle United Shoreline B14/15 Blue" and its Red side are two teams of
 * the same age at the same club, told apart by the colour and nothing else —
 * the same job "Gold" already does above. Read only where an age group has
 * already been named, because a colour anywhere else is part of the club's
 * own name: "Blackhills FC", "West Seattle Red Bulls".
 */
const COLOURS =
  /(?<![A-Za-z])(white|blue|black|red|green|maroon|navy|purple|orange|royal|grey|gray|azul|rojo|blanco|verde|negro)(?![A-Za-z])/i;

/** Where an age group is named, so a colour after it can be read as a tier. */
const AGE_ANCHOR = /(?<![A-Za-z])(?:[BGF]?\s?-?\s?U-?\s?\d{1,2}|[BGF]\s?\d{2}|(?:19|20)\d{2})/i;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * The tier a name states — its canonical spelling, and the text that said so.
 *
 * The matched text is returned because the spellings differ: "ECNL-RL",
 * "ENCL RL" and "ecrl" all mean ECNL RL, and a caller cutting the tier out of
 * the name needs the words that were actually there.
 */
export function tierMatch(name: string): { label: string; text: string } | null {
  for (const [pattern, label] of TIERS) {
    const m = pattern.exec(name);
    if (m) return { label: label.replace("$1", m[1] ?? ""), text: m[0] };
  }
  const anchor = AGE_ANCHOR.exec(name);
  if (anchor) {
    const after = name.slice(anchor.index + anchor[0].length);
    const colour = COLOURS.exec(after);
    if (colour) return { label: upperFirst(colour[1]), text: colour[0] };
  }
  return null;
}

/** The tier a name states, in its canonical spelling, or null. */
export function parseTier(name: string): string | null {
  return tierMatch(name)?.label ?? null;
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
    [/\bshoreline\b|\bsh\b/i, "Shoreline"],
    [/\bnorthwest\b|\bnw\b/i, "Northwest"],
    [/\bsouth\b/i, "South"],
    // Copa, Tango and Samba are streams rather than places, but they are the
    // same kind of fact: which of the club's many sides of one age this is.
    [/\bcopa\b/i, "Copa"],
    [/\btango\b/i, "Tango"],
    [/\bsamba\b/i, "Samba"],
  ],
  "eastside-fc": [[/\bwest\b/i, "West"]],
  "western-washington-surf": [
    [/\bnorth\b/i, "North"],
    [/\bcentral\b/i, "Central"],
    [/\bsouth\b/i, "South"],
  ],
};

/**
 * The club's own stream for this team, or null.
 *
 * A branch wins over a generic word: "Seattle United Shoreline Premier" is a
 * Shoreline team, and Shoreline is what tells it from the club's other sides.
 */
/**
 * The branch of the club this team belongs to, or null.
 *
 * Separate from the stream because a team has both: Western Washington Surf
 * runs an Academy in each of North, Central and South, and "WW SURF BU10
 * Central Academy A" says which of the nine that is.
 */
export function branchMatch(
  name: string,
  clubSlug: string | null,
): { label: string; text: string } | null {
  for (const [pattern, label] of BRANCHES[clubSlug ?? ""] ?? []) {
    const m = pattern.exec(name);
    if (m) return { label, text: m[0] };
  }
  return null;
}

/** The club's own stream — Select, Academy, Premier — or null. */
export function streamMatch(name: string): { label: string; text: string } | null {
  for (const [pattern, label] of PROGRAMS) {
    const m = pattern.exec(name);
    if (m) return { label, text: m[0] };
  }
  return null;
}

export function programMatch(
  name: string,
  clubSlug: string | null,
): { label: string; text: string } | null {
  return branchMatch(name, clubSlug) ?? streamMatch(name);
}

export function parseProgram(name: string, clubSlug: string | null): string | null {
  return programMatch(name, clubSlug)?.label ?? null;
}
