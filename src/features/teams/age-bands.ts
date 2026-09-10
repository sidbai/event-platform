import { normaliseTeamName } from "./merge-plan";
import { remainderOf } from "./canonical-name";

/**
 * The teams the school-year change split in two.
 *
 * Youth soccer here moved its age groups from a calendar year to a school
 * year in the summer of 2026, so a side that was "B14" became "B14/15" — and
 * a directory that holds four seasons of imports now holds both, as two teams
 * with one history between them.
 *
 * This is a one-off. It exists to be run, read by a person, and deleted; a
 * rule about 2026 does not belong in the binder, which has to keep working in
 * 2030.
 *
 * The single year merges into the band and never the other way round. The
 * band is what the club calls the side now, and the name a team is called is
 * the name that should survive it.
 */

export type BandTeam = {
  id: string;
  name: string;
  slug: string;
  clubId: string | null;
  birthYears: number[];
  gender: string | null;
  tier: string | null;
  program: string | null;
  matches: number;
  events: number;
};

export type ClubName = {
  slug: string;
  name: string;
  shortName: string | null;
  aliases: string[];
};

export type BandPair = {
  /** Folded in: the single year. */
  single: BandTeam;
  /** Kept: the band. */
  band: BandTeam;
};

/**
 * What the name says once the club, the cohort, the tier and the stream are
 * taken out of it.
 *
 * This is the whole of rule two. "Atletico B15 Pre-MLS Next Azul" and
 * "Atletico B15/16 Pre-MLS Next Oro" agree on every column in the database —
 * same club, same tier, same programme, and one cohort inside the other — and
 * are two different sides. What tells them apart is the word the club uses to
 * tell them apart, which lives in the part of the name nothing else claims.
 */
function rest(team: BandTeam, club: ClubName | null): string {
  return normaliseTeamName(
    remainderOf({
      name: team.name,
      club,
      gender: team.gender as "boys" | "girls" | null,
      birthYears: team.birthYears,
      tier: team.tier,
      program: team.program,
    }),
  );
}

/** Whether `band` is the school-year band that `single` belongs to. */
export function isBandOf(single: BandTeam, band: BandTeam): boolean {
  return (
    single.birthYears.length === 1 &&
    band.birthYears.length === 2 &&
    band.birthYears[0] === single.birthYears[0] &&
    band.birthYears[1] === single.birthYears[0] + 1
  );
}

/**
 * Pairs worth offering, and never a guess between two.
 *
 * A single-year side with two bands that both fit is a question for a person:
 * Eastside's "B11 Red Bellevue Song" sits between "B11/12 Red" and "B11/12
 * Red Song", and picking either automatically is how a team ends up merged
 * into its own club's other side. The same rule the binder follows.
 */
export function bandPairs(
  teams: BandTeam[],
  clubs: Map<string, ClubName>,
): BandPair[] {
  const bands = teams.filter((t) => t.birthYears.length === 2);
  const out: BandPair[] = [];

  for (const single of teams) {
    if (single.birthYears.length !== 1 || !single.clubId) continue;
    const club = clubs.get(single.clubId) ?? null;
    const mine = rest(single, club);

    const fits = bands.filter(
      (band) =>
        band.clubId === single.clubId &&
        band.id !== single.id &&
        isBandOf(single, band) &&
        band.gender === single.gender &&
        band.tier === single.tier &&
        band.program === single.program &&
        rest(band, clubs.get(band.clubId!) ?? null) === mine,
    );

    if (fits.length === 1) out.push({ single, band: fits[0] });
  }

  return out.sort((a, b) => a.band.name.localeCompare(b.band.name));
}
