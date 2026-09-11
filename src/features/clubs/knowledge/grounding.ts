import type { ClubProfile } from "./profile";

/**
 * Throwing away anything the pages did not actually say.
 *
 * A profile is a claim about what a document says, and that is the rare kind
 * of generated claim a machine can check for itself — for free, without a
 * second model, without a person. So it is checked, before the entry can go
 * on to argue about merges under the authority of "their own website says so".
 *
 * A caution about this file's own history, because it is the useful part.
 * It was written after a run appeared to invent two tiers for Atletico
 * Futbol Club. It had not: their page says "MLS NEXT | Elite Academy" on one
 * line, and the reading that called it a fabrication had only looked at the
 * first 1,500 characters. Both faults that followed were in the checker, not
 * in what it checked — a version that only asked whether each word appeared
 * somewhere, and a version that stripped short words from the middle of a
 * phrase and so reported Crossfire's own "Crossfire Jr Teams" as unsourced.
 *
 * That is the shape to expect. A guard over generated text is itself
 * generated, gets no review from the thing it is guarding, and its failures
 * are quiet in both directions: waving through what it should catch, and
 * condemning what is on the page. Hence `dropped` is reported rather than
 * swallowed, and `pnpm clubs:verify` re-runs the whole check against the
 * cached pages so a change to these rules is measured and not assumed.
 *
 * What cannot be checked by quotation is not trusted: `colours: "mixed"` is a
 * judgement, not a phrase, so it survives only if the pages name a colour at
 * all.
 */

/** Matching is loose on purpose: "Elite Academy (EA)" against "elite academy". */
function flatten(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Is this phrase in the evidence, as a phrase?
 *
 * The words have to appear **together, in order, on one line**. An earlier
 * version only asked whether each word appeared somewhere, and that is not a
 * check at all: Atletico's page happens to contain "mls" and it happens to
 * contain "next", so the invented tier "MLS NEXT" walked straight through the
 * guard written to stop it. Two words scattered across a 2,000-word page are
 * not a phrase.
 *
 * The phrase is tried whole first. A one- or two-letter token is dropped only
 * from the *ends*, because a club writes "Elite Academy (EA)" and the page
 * describing it says "elite academy" — while an interior short word is part
 * of the phrase and removing it invents a different one. Dropping short words
 * everywhere turned "Crossfire Jr Teams", which is on their page word for
 * word, into "crossfire teams", which is not, and reported the club's own
 * programme as something nobody had written down.
 *
 * Per line rather than per page, because flattening turns every line break
 * into a space and a menu item ending in "Elite" above one starting with
 * "Academy" is not a club that runs an Elite Academy.
 */
export function grounded(lines: readonly string[], phrase: string): boolean {
  const whole = flatten(phrase);
  if (!whole) return false;

  const words = whole.split(" ");
  while (words.length > 1 && words[0].length <= 2) words.shift();
  while (words.length > 1 && words[words.length - 1].length <= 2) words.pop();

  const has = (needle: string) => lines.some((line) => ` ${line} `.includes(` ${needle} `));
  return has(whole) || has(words.join(" "));
}

const COLOUR =
  /\b(red|blue|green|white|black|gold|silver|copper|grey|gray|maroon|navy|orange|purple|yellow|teal|crimson|azul|rojo|oro|blanco|negro|verde)\b/i;

/** Any way a club writes an age: U13, 2013, B13, G14/15, "Boys 2012". */
const AGE = /\b(u-?\d{1,2}|20[01]\d|[bg]\d{2}(\/\d{2})?)\b/i;

/**
 * The profile, reduced to what the pages support.
 *
 * Returns the dropped claims as well, because a run that silently discards
 * half a model's answer looks identical to a club that said very little, and
 * the difference is the only signal that a model is confabulating.
 */
export function ground(
  profile: ClubProfile,
  pages: { text: string }[],
): { profile: ClubProfile; dropped: string[] } {
  const raw = pages.map((p) => p.text).join("\n");
  const evidence = raw.split("\n").map(flatten).filter(Boolean);
  const dropped: string[] = [];

  const keep = (values: string[], label: string) =>
    values.filter((v) => {
      if (grounded(evidence, v)) return true;
      dropped.push(`${label}: ${v}`);
      return false;
    });

  const tiers = keep(profile.tiers, "tier");
  const branches = keep(profile.branches, "branch");
  const squadMarkers = keep(profile.squadMarkers, "squad marker");
  const coaches = profile.coaches.filter((c) => {
    // A coach is their name; a name nobody wrote down is a name nobody has.
    if (grounded(evidence, c.name)) return true;
    dropped.push(`coach: ${c.name}`);
    return false;
  });

  let colours = profile.colours;
  if (colours !== "unknown" && colours !== "none" && !COLOUR.test(raw)) {
    dropped.push(`colours: ${colours}`);
    colours = "unknown";
  }

  let ageBands = profile.ageBands;
  if (ageBands !== "unknown" && !AGE.test(raw)) {
    dropped.push(`ageBands: ${ageBands}`);
    ageBands = "unknown";
  }

  /*
   * A summary is prose and cannot be checked phrase by phrase. When nothing
   * else survived, it is the last thing standing and it is describing a club
   * the model was remembering rather than reading — so it goes too.
   */
  const survives =
    tiers.length > 0 ||
    branches.length > 0 ||
    squadMarkers.length > 0 ||
    coaches.length > 0 ||
    colours !== "unknown" ||
    ageBands !== "unknown";

  return {
    profile: {
      ...profile,
      tiers,
      branches,
      squadMarkers,
      coaches,
      colours,
      ageBands,
      summary: survives ? profile.summary : "",
    },
    dropped,
  };
}
