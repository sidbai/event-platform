import { vocabularyOf, type ClubVocabulary } from "./vocabulary";
import type { ClubProfile } from "./profile";

/**
 * Every team name held up against what its club says about its own naming.
 *
 * Two questions at once, and the second is the reason this exists.
 *
 * *Is this name odd?* — a side carrying a word its club does not use is
 * either misfiled or misspelled.
 *
 * *Is the knowledge base wrong?* — the same finding, read the other way. A
 * profile is one person's reading of one website on one day, and the honest
 * assumption is that it is incomplete. Running it against 2,616 real names is
 * the cheapest way to find out where: a level that forty teams carry and no
 * profile mentions is a gap in the profile, not forty odd teams.
 *
 * Read-only and pure. It proposes nothing and merges nothing; the output is a
 * list to read.
 */

export type AuditTeam = {
  slug: string;
  name: string;
  clubSlug: string | null;
  /**
   * Every way this club is written, not just its full name.
   *
   * Without the short name and the aliases, the audit's loudest finding is
   * itself: 117 Western WA Surf teams are published as "WW Surf", 45 Northwest
   * United teams as "NW United", and every Crossfire side as "XF" — all of
   * which it reported as words the club had never heard of. The club is the
   * one word in a team name that is never the answer.
   */
  clubNames: string[];
  birthYears: number[];
};

export type Finding = {
  check: "unknown-word" | "no-profile" | "no-club";
  team: string;
  clubSlug: string | null;
  /** The word or fact the finding is about, for grouping. */
  about: string;
};

/** Words that are never a level or a place: ages, genders, and soccer noise. */
const NOISE = new RegExp(
  [
    // Soccer furniture that appears in half the names in the directory.
    "^(fc|sc|cf|afc|sa|soccer|club|academy|premier|select|united|and|the|of|teams?)$",
    // Every way an age is written here, and there are several. "B14/15" and
    // "GU12" and "2013" are all the same fact, and none of them is a level.
    "^(boys?|girls?|[bg]|u-?\\d{1,2}|[bg]u?-?\\d{2}(/\\d{2})?|\\d{2}(/\\d{2})?|\\d{4}(/\\d{2,4})?)$",
    /*
     * A lone letter or digit is a squad mark, and `teams/match-plan.ts`
     * already owns them — `squadMarks` refuses 47 pairs on exactly these.
     * Reporting them here would be a second rule complaining about something
     * the first one has handled, which reads as 150 findings nobody should
     * act on.
     */
    "^([a-d]|i{1,3}|[1-9])$",
  ].join("|"),
  "i",
);

function wordsOf(name: string, clubNames: string[]): string[] {
  // Longest first, so "Western Washington Surf" is removed before "Surf".
  const stripped = [...clubNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .reduce(
      (out, club) =>
        out.replace(new RegExp(club.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " "),
      name,
    );
  /*
   * Hyphens and slashes stay inside a word. "U-9" is one age and "Pre-ECNL"
   * is one level; split on them and the audit reports a bare "U" and a bare
   * "Pre" as words the club has never heard of.
   */
  return stripped
    .split(/[^\p{L}\p{N}/-]+/u)
    .map((w) => w.replace(/^[-/]+|[-/]+$/g, "").trim())
    .filter((w) => w.length > 0 && !NOISE.test(w));
}

/**
 * Does the club's vocabulary account for this word?
 *
 * Loose on purpose — a vocabulary entry of "Elite Academy (EA)" should cover
 * a name saying "EA", and "ECNL RL" should cover "ECNL". The question being
 * asked is "has anybody written this down", not "is it spelled identically".
 */
function accountedFor(word: string, vocabulary: ClubVocabulary): boolean {
  const needle = word.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (needle.length === 0) return true;
  return [...vocabulary.levels, ...vocabulary.branches].some((entry) => {
    const parts = new Set(entry.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    return needle.every((part) => parts.has(part));
  });
}

export function auditTeam(
  team: AuditTeam,
  profile: ClubProfile | null,
): Finding[] {
  if (!team.clubSlug) {
    return [{ check: "no-club", team: team.name, clubSlug: null, about: "unfiled" }];
  }
  if (!profile) {
    return [
      { check: "no-profile", team: team.name, clubSlug: team.clubSlug, about: team.clubSlug },
    ];
  }

  const vocabulary = vocabularyOf(profile);
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const word of wordsOf(team.name, team.clubNames)) {
    const key = word.toLowerCase();
    if (seen.has(key) || accountedFor(word, vocabulary)) continue;
    seen.add(key);
    out.push({
      check: "unknown-word",
      team: team.name,
      clubSlug: team.clubSlug,
      about: word,
    });
  }
  return out;
}

/**
 * Findings grouped by what they are about, commonest first.
 *
 * A list of 2,616 rows is not a finding; "forty Highline teams say Rise and
 * the profile has never heard of it" is. The count is the whole signal — one
 * team with an odd word is a typo, forty is a level somebody forgot to read.
 */
export function groupFindings(findings: Finding[]): {
  check: Finding["check"];
  clubSlug: string | null;
  about: string;
  count: number;
  examples: string[];
}[] {
  const byKey = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.check}|${f.clubSlug}|${f.about.toLowerCase()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }
  return [...byKey.values()]
    .map((group) => ({
      check: group[0].check,
      clubSlug: group[0].clubSlug,
      about: group[0].about,
      count: group.length,
      examples: group.slice(0, 3).map((f) => f.team),
    }))
    .sort((a, b) => b.count - a.count);
}
