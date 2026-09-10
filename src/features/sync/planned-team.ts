import { clubIndex, matchClub, type ClubMatch } from "@/features/clubs/matching";
import { canonicalName } from "@/features/teams/canonical-name";
import { teamFactsFrom, type TeamFacts } from "@/features/teams/facts";

/**
 * The row a synced team would be written as, decided in one place.
 *
 * Pulled out of the write so that something other than the write can ask.
 * A connector's first run against a league is the moment its names are set —
 * a name is only written when a row is created, and no amount of re-syncing
 * changes one afterwards — so the answer has to be available before the write
 * rather than discoverable after it.
 *
 * Elite Academy cost a reset, a re-sync and an evening because nobody could
 * ask. Nine ALBION teams went under a club in Portland, and the way that
 * became visible was reading a fixture list.
 */

export type ClubRow = {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  aliases: string[];
};

export type PlannedTeam = {
  /** What the platform published. */
  published: string;
  /** The name the row would be given. */
  written: string;
  facts: TeamFacts;
  club: ClubRow | null;
  division: string;
};

/**
 * The directory, in the shape both the matcher and the naming want it.
 *
 * Built once for a whole league rather than per team: Sports Affinity's is
 * four hundred and forty-nine teams, and the alternative is a query inside a
 * loop that runs that many times.
 */
export function clubDirectory(clubs: ClubRow[]) {
  const index = clubIndex(clubs.map((c) => ({ id: c.id, name: c.name })));
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const aliases = new Map<string, string>();
  for (const club of clubs) for (const a of club.aliases) aliases.set(a, club.id);
  return { index, byId, aliases };
}

export type Directory = ReturnType<typeof clubDirectory>;

/**
 * The name a row gets, given its club and what its own name says.
 *
 * Shared with the write rather than reproduced beside it. A preflight that
 * predicts a different name from the one the sync writes is worse than no
 * preflight — it would be believed.
 */
export function writtenName(
  published: string,
  club: ClubRow | null,
  facts: TeamFacts,
): string {
  return canonicalName({
    name: published,
    club: club && {
      slug: club.slug,
      name: club.name,
      shortName: club.shortName,
      aliases: club.aliases,
    },
    gender: facts.gender,
    birthYears: facts.birthYears,
    tier: facts.tier,
    program: facts.program,
  });
}

/** What one published name would become. The same steps the write takes. */
export function plannedTeam(
  published: string,
  division: string,
  directory: Directory,
  context: { seasonStart: Date | null; gender?: TeamFacts["gender"] },
): PlannedTeam {
  const match: ClubMatch | null = matchClub(published, directory.aliases, directory.index);
  const club = match ? (directory.byId.get(match.clubId) ?? null) : null;
  const facts = teamFactsFrom(published, {
    seasonStart: context.seasonStart,
    clubSlug: club?.slug ?? null,
    division,
    gender: context.gender ?? null,
  });
  return { published, written: writtenName(published, club, facts), facts, club, division };
}
