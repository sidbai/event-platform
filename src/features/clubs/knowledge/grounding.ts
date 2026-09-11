import type { ClubProfile } from "./profile";

/**
 * Throwing away everything the pages did not actually say.
 *
 * The first run of this read Atletico Futbol Club's home page — a mission
 * statement, a jamboree flyer and four nav links — and recorded that the club
 * runs "MLS NEXT" and "Elite Academy" tiers. Neither phrase appears anywhere
 * on the page. Nothing in the prompt was ambiguous; the model simply knew
 * something about a club with that name and answered from that.
 *
 * That entry would have gone on to argue about merges under the authority of
 * "their own website says so", which is worse than having no knowledge base
 * at all. Asking the model more firmly is not a fix — the fix is that a claim
 * about what a page says is checkable against the page, deterministically,
 * here, for free.
 *
 * What cannot be checked this way is dropped to "unknown" rather than
 * trusted: `colours: "mixed"` is a judgement rather than a quotation, so it
 * survives only if the pages contain a colour at all.
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
 * Is this phrase in the evidence?
 *
 * Every word of it has to appear, as a word — so "NPL" is not found inside
 * "NPLayers", which a substring check happily does.
 *
 * Words of one or two letters are not required, because a club writes
 * "Elite Academy (EA)" and the pages that describe it say "elite academy".
 * Demanding the parenthetical too rejected the thing we came for. Where the
 * whole phrase is short — "A", "B", "II", which are real squad markers — the
 * phrase itself must appear as a word.
 *
 * Adjacency is not required: a page saying "elite" in one line and "academy"
 * in another counts. That is the deliberate loose end, and it is the right
 * way round — this check exists to catch a club being described from memory,
 * where none of the words appear at all.
 */
export function grounded(haystack: string, phrase: string): boolean {
  const needle = flatten(phrase);
  if (!needle) return false;
  const words = new Set(haystack.split(" "));
  const wanted = needle.split(" ").filter((w) => w.length >= 3);
  if (wanted.length === 0) return needle.split(" ").every((w) => words.has(w));
  return wanted.every((w) => words.has(w));
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
  const evidence = flatten(pages.map((p) => p.text).join("\n"));
  const raw = pages.map((p) => p.text).join("\n");
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
