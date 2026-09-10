import { looksLikeBirthYear } from "./age";
import { branchMatch, fullerTier, parseTier, streamMatch, tierMatch } from "./naming";

/**
 * One way to write a team's name.
 *
 * Every platform prints the same team differently — "XF U12 B14/15 ECNL 1",
 * "Crossfire Select B-U9A Matisz", "Highline Premier FC - Heat BU12,
 * Zwaller" — and a directory that shows them side by side is unreadable.
 * The order below is the one families read them in:
 *
 *   <club> <program> <B|G>yy/yy <tier> <the rest>
 *   Crossfire Select B16/17 A Matisz
 *   Seattle United Shoreline B14/15 Blue
 *   Eastside FC West B15/16 Red
 *
 * Only a club's teams. A side with no club in the directory — a pickup team,
 * a visiting side nobody has filed — has no fixed vocabulary behind its name,
 * and the words it leads with are as likely to be its own as a club's. There
 * is nothing to normalise it against, so it keeps the name it was published
 * under.
 *
 * The last segment is deliberately not parsed. A trailing word is a coach's
 * surname ("Zwaller"), a squad letter ("A"), or the side's own nickname
 * ("Tango", "Sharks", "Benfica"), and nothing in the string tells the three
 * apart — "Washington Rush BU14 Rush" and "Eastside FC GU12 Lombard" have the
 * same shape. So whatever is not recognised is carried through unchanged, in
 * the order it was written. A rename may reorder a name and it may drop a
 * club's name repeated twice; it never invents and never quietly deletes.
 */

export type NameFacts = {
  /** The published name, which is where everything not in a column lives. */
  name: string;
  club: {
    name: string;
    slug: string;
    aliases?: string[];
    /** Stands in for the name at the front of a team's, where a club has one. */
    shortName?: string | null;
  } | null;
  gender: string | null;
  birthYears: number[];
  /** Columns win over the name: an admin may have corrected them. */
  tier: string | null;
  program: string | null;
};

/** "B14/15", "G13", or null when the team's years or gender are unknown. */
export function cohortLabel(
  gender: string | null | undefined,
  birthYears: number[] | null | undefined,
): string | null {
  if (gender !== "boys" && gender !== "girls") return null;
  if (!birthYears || birthYears.length === 0) return null;
  // Rows already hold a season where a cohort belongs — {2026, 2027} on five
  // U10 sides. Printing it would write the mistake into the name, where it
  // stops looking like one.
  if (!birthYears.every((y) => looksLikeBirthYear(y))) return null;
  const letter = gender === "boys" ? "B" : "G";
  const yy = birthYears.map((y) => String(y % 100).padStart(2, "0"));
  return `${letter}${yy.join("/")}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Every notation the imports use for an age group, so all of them can be cut
 * out at once. The cohort is rebuilt from the birth-years column instead,
 * which is the one that does not go stale — see age.ts.
 */
const AGE_TOKENS = [
  // "B13/14", "B17-18", "G09/10", "2013/2014"
  /(?<![A-Za-z0-9])[BGF]?\s?(?:19|20)?\d{2}\s?[-–/]\s?(?:19|20)?\d{2}(?![0-9])/g,
  // "B09", "B2013", "2015", "2011B", "14B"
  /(?<![A-Za-z0-9])[BGF]?\s?(?:19|20)\d{2}\s?[BGF]?(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])[BGF]\s?\d{2}(?![0-9])/g,
  /(?<![A-Za-z0-9])\d{2}\s?[BGF](?![A-Za-z0-9])/g,
  // The gender spelled out, which the cohort letter now carries.
  /(?<![A-Za-z])(?:boys?|girls?)(?![A-Za-z])/gi,
];

/*
 * The U-number, and the letter clubs weld to it.
 *
 * "B-U10A", "GU13 A", "BU10B", "U16B" — and the letter is two different
 * things. A trailing B or G is the gender when nothing else has said it, and
 * a squad letter when the token already leads with one: "BU10B" is the boys'
 * B side. Any other letter is always a squad. The squad letter is kept,
 * because it is the whole of what tells one club's two U10 sides apart.
 */
const U_TOKEN =
  /(?<![A-Za-z])([BGF])?\s?-?\s?U-?\s?(\d{1,2})(?:\s?[-/]\s?U?-?\s?(\d{1,2}))?\s?([A-Za-z]{1,2})?(?![A-Za-z0-9])/gi;

function cutUTokens(text: string): string {
  return text.replace(U_TOKEN, (_all, lead, digits, second, trailing) => {
    const kept: string[] = [];
    /*
     * "GU-18/19" is one side playing two age groups; "GU11-2" is that club's
     * second U11 side. Consecutive numbers are the age range and go with the
     * rest of the age token; anything else is a squad number and stays.
     */
    // Either direction: "BU12/U11" counts down where "GU-18/19" counts up,
    // and both are one side playing two age groups.
    if (second !== undefined && Math.abs(Number(second) - Number(digits)) !== 1) {
      kept.push(second);
    }
    if (trailing) {
      // A trailing B or G is the gender where nothing else has said it, and a
      // squad letter where the token already leads with one: "BU10B" is the
      // boys' B side. Any other letter is always a squad.
      const isGenderLetter = /^[bgf]$/i.test(trailing) && !lead;
      if (!isGenderLetter) kept.push(trailing.toUpperCase());
    }
    return kept.length === 0 ? " " : ` ${kept.join(" ")} `;
  });
}

/**
 * The bits of a club's own name that say nothing about which team this is.
 *
 * Left behind when a club is written twice — "Eastside FC (WA) - Eastside
 * FCECNL" — or when the club record's name and the printed one disagree
 * about how much of it to spell out.
 */
const CLUB_FILLER =
  /(?<![A-Za-z])(?:fc|sc|s\.c\.|f\.c\.|soccer|club|association|wa|washington)(?![A-Za-z])/gi;
/**
 * "United", which is a club's whole identity or none of it.
 *
 * "South Kitsap United" is how South Kitsap Soccer Club enters tournaments,
 * and the word left behind said nothing. But Seattle United is United, so the
 * word is only dropped for a club whose own name does not carry it.
 */
const UNITED = /(?<![A-Za-z])united(?![A-Za-z])/gi;

/**
 * Every way this club is written, longest first so the fullest one goes.
 *
 * Including the leading words of its own name, because a club records itself
 * as "Atletico Futbol Club" and enters tournaments as "Atletico". Without
 * those, the shorter form survives the strip and the name says the club
 * twice.
 */
function clubForms(club: NonNullable<NameFacts["club"]>): string[] {
  const words = club.name.split(/\s+/);
  const prefixes = words
    .map((_, i) => words.slice(0, i + 1).join(" "))
    // A single leading word only when it is long enough to be the club on
    // its own. "Sound" and "Atletico" are; "Lake" is not, and stripping it
    // off Lake Hills — a club since folded into Lake Washington Premier —
    // left teams called "Hills".
    .filter((p) => p.includes(" ") || p.length >= 5);
  return [
    ...new Set([
      club.name,
      ...(club.shortName ? [club.shortName] : []),
      ...(club.aliases ?? []),
      ...prefixes,
      ...initialisms(words),
    ]),
  ]
    .filter((f) => f.length >= 2)
    .sort((a, b) => b.length - a.length);
}

/**
 * How a club abbreviates itself — "Washington Premier FC" as "WPFC".
 *
 * Computed rather than listed, because every club does it and only twelve of
 * them have an alias recorded. Three letters at least: two initials match too
 * much to cut out of a name safely.
 */
function initialisms(words: string[]): string[] {
  const letters = words
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter((w) => w !== "")
    // "FC" and "SC" go in whole — "Washington Premier FC" abbreviates to
    // WPFC, not WPF.
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase()));
  // With and without the FC or SC on the end, since clubs abbreviate both
  // ways: Fife Milton Edgewood SC enters as FME, Washington Premier FC as
  // WPFC.
  const trimmed = /^(?:fc|sc|club|association|academy)$/i.test(
    words[words.length - 1] ?? "",
  )
    ? letters.slice(0, -1)
    : letters;
  return [letters.join(""), trimmed.join("")].filter((f) => f.length >= 3);
}

/**
 * What the name says that the canonical segments do not already carry.
 *
 * Removal, never extraction: each recognised thing is cut out where it stands
 * and the gaps are closed, so anything unaccounted for survives in the order
 * it was written.
 */
export function remainderOf(facts: NameFacts): string {
  let rest = facts.name;

  if (facts.club) {
    for (const form of clubForms(facts.club)) {
      // The club's name as written, and as written with the spaces closed up
      // ("Crossfire Premier" printed "CrossfirePremier"), anywhere in the
      // string rather than only at the front.
      // Aliases are stored normalised — "nwunited", "wwsurf" — so the
      // separators the name actually uses have to be allowed back in.
      const spaced = escape(form).replace(/\s+/g, "[\\s.-]*");
      const loose = /^[a-z0-9]+$/.test(form)
        ? escape(form).split("").join("[\\s.-]*")
        : spaced;
      rest = rest.replace(new RegExp(`(?<![A-Za-z])${loose}(?![A-Za-z])`, "gi"), " ");
    }
  }

  /*
   * Both the words the name used and the canonical spelling that will be
   * printed. A second run sees its own output — "National 1" where the name
   * said "N1" — and without this it fails to recognise it and prints it twice.
   */
  const tier = tierMatch(facts.name);
  const branch = branchMatch(facts.name, facts.club?.slug ?? null);
  const stream = streamMatch(facts.name);
  const said = [
    tier?.text,
    facts.tier,
    tier?.label,
    branch?.text,
    branch?.label,
    stream?.text,
    stream?.label,
    facts.program,
  ];
  for (const text of said) {
    if (text) rest = rest.replace(text, " ");
  }

  // The age group last, because a source may weld the two together —
  // "BU13Navy" — and cutting the tier out first unsticks it.
  rest = cutUTokens(rest);
  for (const pattern of AGE_TOKENS) rest = rest.replace(pattern, " ");

  rest = withoutStrayYears(rest, facts.birthYears);

  if (facts.club) {
    rest = rest.replace(CLUB_FILLER, " ");
    if (!UNITED.test(facts.club.name)) rest = rest.replace(UNITED, " ");
    UNITED.lastIndex = 0;
  }

  return tidy(rest);
}

/**
 * A two-digit year left standing on its own by the age-group cut.
 *
 * "LWPFC N1 B13 14" and "Seattle United B09/10 Blue 09" write a year detached
 * from the pair it belongs to, and cutting the pair leaves the stray behind —
 * "B13 National 1 14", which reads as a squad number and is not one.
 *
 * Only a two-digit number that repeats one of the team's own birth years, or
 * the year straight after them. A squad number stays: "MRFC Academy B09/10 2"
 * is that club's second side and the 2 is the whole of what says so.
 */
function withoutStrayYears(rest: string, birthYears: number[]): string {
  if (birthYears.length === 0) return rest;
  const own = new Set(birthYears.map((y) => y % 100));
  own.add((birthYears[birthYears.length - 1] + 1) % 100);
  return rest.replace(/(?<![A-Za-z0-9/])(\d{2})(?![0-9/])/g, (all, digits) =>
    own.has(Number(digits)) ? " " : all,
  );
}

/** Punctuation the sources use as glue, and the empty shells it leaves. */
function tidy(raw: string): string {
  return balanceBrackets(
    raw
      .replace(/\(\s*\)/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*([,;])\s*/g, " ")
      .replace(/(?:^|\s)[-–—/]+/g, " ")
      .replace(/^[\s,;:.\-–—/]+|[\s,;:.\-–—/]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Drops a bracket whose partner was cut out — "B13 Yellow (Nitros".
 *
 * Cutting the age group out of "EFC B2013 (Nitros) Yellow" is fine; cutting
 * it out of "(BU13) Nitros" leaves a bracket that closes nothing, and a name
 * that looks like it was truncated.
 */
function balanceBrackets(text: string): string {
  const chars = [...text];
  const opens: number[] = [];
  const drop = new Set<number>();
  chars.forEach((c, i) => {
    if (c === "(") opens.push(i);
    else if (c === ")") {
      if (opens.length === 0) drop.add(i);
      else opens.pop();
    }
  });
  for (const i of opens) drop.add(i);
  if (drop.size === 0) return text;
  return chars
    .filter((_, i) => !drop.has(i))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The team's name, written the one way.
 *
 * Falls back to the published name whenever the rewrite would say less than
 * it did: a team with no club record and no birth years has nothing to build
 * from, and half a name is worse than somebody else's whole one.
 */
export function canonicalName(facts: NameFacts): string {
  const cohort = cohortLabel(facts.gender, facts.birthYears);
  // Only a club's teams: there is nothing to normalise the rest against.
  if (!facts.club) return published(facts.name);
  const slug = facts.club.slug;
  // Both, and in this order: a team has a branch and a stream at once —
  // "WW SURF BU10 Central Academy A" is the Central Academy's A side.
  const branch = branchMatch(facts.name, slug)?.label ?? null;
  const stream = streamMatch(facts.name)?.label ?? null;
  const tier = fullerTier(facts.tier, parseTier(facts.name));
  /*
   * "XF B13/14 ECNL 2" rather than "Crossfire Premier B13/14 ECNL 2". The
   * club is a prefix here, not the subject: a directory page of the full name
   * is a column of the same two words with the team hidden behind them.
   */
  const club = facts.club.shortName || facts.club.name;
  const rest = remainderOf(facts);

  // A team whose years or gender nobody has established yet. Half a name is
  // worse than the whole one somebody published.
  if (!cohort) return published(facts.name);

  const parts = [branch, stream, facts.program, cohort, tier, rest].filter(
    (p): p is string => typeof p === "string" && p !== "",
  );
  /*
   * A club whose own name already carries the program — "Highline Premier FC"
   * and program "Premier" — must not say it twice. The club leads and is not
   * deduped against itself; what follows is measured against its full name,
   * which is what it is called even when it is printed short.
   */
  const said = [...facts.club.name.split(/\s+/), ...club.split(/\s+/)];
  return [club, ...dedupe(parts, said)].join(" ");
}

/** The name as published: whitespace tidied, not another character touched. */
function published(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Drops a segment the name has already said — word for word.
 *
 * "Highline Premier FC" with program "Premier" must not say it twice. Matched
 * on whole words rather than substrings, because on substrings every
 * single-letter squad segment is already contained in something and quietly
 * disappears: "Sound FC B12 D" lost its D.
 *
 * `said` starts with the club's words even when the club is printed short.
 * "Crossfire Premier" shortened to "XF" is still the club that has "Premier"
 * in its name, so the "Premier" the published name carries is its own word
 * and not a second thing to announce — without this, shortening the prefix
 * puts it back: "XF Premier G11 ECNL".
 */
function dedupe(parts: string[], alreadySaid: string[] = []): string[] {
  const out: string[] = [];
  const said = new Set<string>(alreadySaid.map(norm).filter((w) => w !== ""));
  for (const part of parts) {
    const words = part.split(/\s+/).map(norm).filter((w) => w !== "");
    if (words.length > 0 && words.every((w) => said.has(w))) continue;
    for (const w of words) said.add(w);
    out.push(part);
  }
  return out;
}

