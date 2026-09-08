import {
  birthYearsForAgeGroup,
  parseAgeGroup,
  parseBirthYears,
  parseGender,
  seasonYearOf,
} from "./age";
import { parseTier, parseProgram } from "./naming";

/**
 * Everything a team's own name says about it.
 *
 * Gathered in one place because it has to happen where teams are created —
 * inside the sync — rather than in a script somebody remembers afterwards.
 * Three backfills existed for these fields, and in the day after they last
 * ran, 173 imported teams arrived with no club, no birth years and no
 * gender: facts the duplicate finder then had nothing to match on, which is
 * how a Spring Classic team sat beside its own club's Labor Day row with
 * nothing in common but a hunch.
 *
 * Pure. The club comes in already resolved, since finding it needs the
 * directory and its aliases.
 */

export type TeamFacts = {
  birthYears: number[];
  gender: "boys" | "girls" | null;
  tier: string | null;
  program: string | null;
};

export function teamFactsFrom(
  name: string,
  context: {
    seasonStart: Date | null;
    clubSlug: string | null;
    /**
     * The division this team played in, as the source prints it.
     *
     * "Boys-U10 - Silver 1", "Girls U15". A tournament states the gender and
     * the age group in the heading even when a team's own name says neither,
     * and a side entered in the boys' U15 flight is a boys' U15 side. All 227
     * teams here with no gender were in a division that named one.
     */
    division?: string | null;
  },
): TeamFacts {
  /*
   * The team's own name first, the division only where it is silent.
   *
   * A name is about the team; a division is about the flight it entered. They
   * almost always agree, and where they do not the team's own name is the
   * better authority on what the team is.
   */
  let birthYears = parseBirthYears(name);
  if (birthYears.length === 0 && context.seasonStart) {
    // Only from an age group, and only against a season: U12 is one cohort in
    // an autumn league and another in a June tournament.
    const u = parseAgeGroup(name) ?? parseAgeGroup(context.division ?? "");
    if (u !== null) {
      birthYears = birthYearsForAgeGroup(u, seasonYearOf(context.seasonStart));
    }
  }

  return {
    birthYears,
    gender: parseGender(name) ?? parseGender(context.division ?? ""),
    tier: parseTier(name),
    program: parseProgram(name, context.clubSlug),
  };
}
