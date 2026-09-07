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
  context: { seasonStart: Date | null; clubSlug: string | null },
): TeamFacts {
  const stated = parseBirthYears(name);
  let birthYears = stated;

  if (birthYears.length === 0 && context.seasonStart) {
    // Only from the age group, and only with a season to read it against:
    // U12 is one cohort in an autumn league and another in a June tournament.
    const u = parseAgeGroup(name);
    if (u !== null) {
      birthYears = birthYearsForAgeGroup(u, seasonYearOf(context.seasonStart));
    }
  }

  return {
    birthYears,
    gender: parseGender(name),
    tier: parseTier(name),
    program: parseProgram(name, context.clubSlug),
  };
}
