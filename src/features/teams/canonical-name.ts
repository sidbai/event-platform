import { parseTier, parseProgram, tierMatch, programMatch } from "./naming";

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
  club: { name: string; slug: string; aliases?: string[] } | null;
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
  /(?<![A-Za-z])([BGF])?\s?-?\s?U-?\s?(\d{1,2})(?:\s?[-/]\s?(\d{1,2}))?\s?([A-Za-z])?(?![A-Za-z0-9])/gi;

function cutUTokens(text: string): string {
  return text.replace(U_TOKEN, (_all, lead, digits, second, trailing) => {
    const kept: string[] = [];
    /*
     * "GU-18/19" is one side playing two age groups; "GU11-2" is that club's
     * second U11 side. Consecutive numbers are the age range and go with the
     * rest of the age token; anything else is a squad number and stays.
     */
    if (second !== undefined && Number(second) !== Number(digits) + 1) {
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
  return [...new Set([club.name, ...(club.aliases ?? []), ...prefixes, ...initialisms(words)])]
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

  if (!facts.club) {
    // Nothing to look the club up by, so the words the name leads with are
    // the club — and they are already going to lead the rewrite.
    rest = rest.slice(leadCut(facts.name));
  }

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
  for (const text of [tier?.text, facts.tier, tier?.label]) {
    if (text) rest = rest.replace(text, " ");
  }
  const program = programMatch(facts.name, facts.club?.slug ?? null);
  for (const text of [program?.text, facts.program, program?.label]) {
    if (text) rest = rest.replace(text, " ");
  }

  // The age group last, because a source may weld the two together —
  // "BU13Navy" — and cutting the tier out first unsticks it.
  rest = cutUTokens(rest);
  for (const pattern of AGE_TOKENS) rest = rest.replace(pattern, " ");

  if (facts.club) {
    rest = rest.replace(CLUB_FILLER, " ");
    if (!UNITED.test(facts.club.name)) rest = rest.replace(UNITED, " ");
    UNITED.lastIndex = 0;
  }

  return tidy(rest);
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
  const program = facts.program ?? parseProgram(facts.name, facts.club?.slug ?? null);
  const tier = fullerTier(facts.tier, parseTier(facts.name));
  // With no club record the words the name leads with are the club — but a
  // name that puts its tier up front ("Oregon Premier FC Pre ECNL B2015/16")
  // would carry it into the club's own name and then print it twice.
  const club = facts.club?.name ?? withoutNaming(leadOf(facts.name), facts);
  const rest = remainderOf(facts);

  if (!club || !cohort) return tidy(facts.name);

  const parts = [club, program, cohort, tier, rest].filter(
    (p): p is string => typeof p === "string" && p !== "",
  );
  // A club whose own name already carries the program — "Highline Premier
  // FC" and program "Premier" — must not say it twice.
  return dedupe(parts).join(" ");
}

/**
 * Drops a segment the name has already said — word for word.
 *
 * "Highline Premier FC" with program "Premier" must not say it twice. Matched
 * on whole words rather than substrings, because on substrings every
 * single-letter squad segment is already contained in something and quietly
 * disappears: "Sound FC B12 D" lost its D.
 */
/**
 * The lead, minus a tier it happened to state — "Oregon Premier FC ECNL".
 *
 * Only the tier. The program is left where it is, because for a club with no
 * record here it is usually part of the club's own name: cut "Premier" out of
 * "Oregon Premier FC" and the club becomes "Oregon FC". Saying it twice is
 * prevented downstream, where a repeated word is dropped rather than moved.
 */
/**
 * The more specific reading of the same tier.
 *
 * The column is a summary of the name and can be the staler of the two: rows
 * hold "RCL" where the name says "RCL 1", and "ECNL" where it says "ECNL RL".
 * Where one is the other plus a division, the fuller one is right. Where they
 * disagree outright the column wins, because somebody may have corrected it.
 */
function fullerTier(column: string | null, fromName: string | null): string | null {
  if (!column) return fromName;
  if (!fromName) return column;
  if (fromName.startsWith(column) && fromName.length > column.length) return fromName;
  return column;
}

function withoutNaming(lead: string, facts: NameFacts): string {
  const tier = tierMatch(facts.name);
  if (!tier) return tidy(lead);
  const out = tidy(lead.replace(tier.text, " "));
  return out === "" ? tidy(lead) : out;
}

function dedupe(parts: string[]): string[] {
  const out: string[] = [];
  const said = new Set<string>();
  for (const part of parts) {
    const words = part.split(/\s+/).map(norm).filter((w) => w !== "");
    if (words.length > 0 && words.every((w) => said.has(w))) continue;
    for (const w of words) said.add(w);
    out.push(part);
  }
  return out;
}

/**
 * The club a name leads with, for the 924 teams filed under no club.
 *
 * Everything before the first age token, which is where the club sits in
 * every notation here. Nothing is written to clubs from this — it only
 * decides what leads the printed name.
 */
export function leadOf(name: string): string {
  return tidy(withoutRepeats(name.slice(0, leadCut(name))));
}

/** Where the club stops and the age group starts. */
function leadCut(name: string): number {
  let cut = name.length;
  for (const pattern of [U_TOKEN, ...AGE_TOKENS]) {
    const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    const m = re.exec(name);
    if (m && m.index < cut) cut = m.index;
  }
  return cut;
}

/**
 * A club written twice, which is how the exporters join two systems' names.
 *
 * "Capital FC - Capital FC B15 Pre-ECNL 1", "Albion SC Washington - ALBION SC
 * WA BU15 Academy". The halves are the same club spelled two ways, so the
 * fuller spelling is kept and the other dropped — but only when one really is
 * the other abbreviated, never when they are two different words.
 */
function withoutRepeats(lead: string): string {
  // A separator with space around it, never a bare hyphen: splitting on that
  // cuts "Pre-ECNL" and "ECNL-RL" in half and the tier stops being findable.
  const parts = lead.split(/\s*[,;]\s*|\s+[-–—]+\s*|\s*[-–—]+\s+/).filter((p) => p.trim() !== "");
  if (parts.length < 2) return lead;
  const keep: string[] = [];
  for (const part of parts) {
    const key = norm(part);
    if (key === "") continue;
    const i = keep.findIndex((k) => {
      const other = norm(k);
      return other.startsWith(key) || key.startsWith(other);
    });
    if (i === -1) keep.push(part);
    else if (norm(part).length > norm(keep[i]).length) keep[i] = part;
  }
  return keep.join(" ");
}
