import { sameCohort } from "@/features/teams/age";

import { writtenName, type PlannedTeam } from "./planned-team";

/**
 * What a league would look like once it is written, before writing it.
 *
 * Every one of these was a real morning. A club missing from the directory
 * puts its teams under whichever club the matcher could reach — nine ALBION
 * sides went to a club in Portland. A league whose names carry no age lands
 * as seven teams called the same thing. A name that reads back differently
 * than it was written makes the rename dry run, the only check there is,
 * unreadable.
 *
 * None of it needed a database write to discover. It only needed somebody to
 * ask before rather than after.
 */

export type Preflight = {
  teams: number;
  divisions: number;
  /** Published names the directory has no club for. These keep their name. */
  homeless: { published: string; division: string }[];
  /** Names two or more teams would carry, which makes them one team's page. */
  shared: { name: string; count: number }[];
  /**
   * Divisions holding two cohorts that are not the same age group.
   *
   * Not "two different year lists": a club that names a single-year side
   * inside a two-year band — "Seattle Celtic B14" in a U12 flight — is naming
   * a team within that age group, and eighteen of eighteen Sports Affinity
   * flights look like that. What matters is a band from a different age
   * group, which means a team was read as playing somewhere it is not.
   */
  mixed: { division: string; cohorts: string[] }[];
  /** Names that would not survive being read back — see canonical-name. */
  unstable: { written: string; reread: string }[];
  /** Every club the league needs, and whether the directory has it. */
  clubs: { name: string; teams: number }[];
};

export function preflight(planned: PlannedTeam[]): Preflight {
  const homeless: Preflight["homeless"] = [];
  const byName = new Map<string, number>();
  const cohorts = new Map<string, Set<string>>();
  const unstable: Preflight["unstable"] = [];
  const clubs = new Map<string, number>();

  for (const t of planned) {
    if (!t.club) homeless.push({ published: t.published, division: t.division });
    else clubs.set(t.club.name, (clubs.get(t.club.name) ?? 0) + 1);

    byName.set(t.written, (byName.get(t.written) ?? 0) + 1);

    const set = cohorts.get(t.division) ?? new Set<string>();
    set.add(t.facts.birthYears.join("/") || "none");
    cohorts.set(t.division, set);

    /*
     * Read back exactly as the rename would read it: from the written name,
     * with the facts the row would carry. A difference here is a name that
     * changes every time somebody runs the rename.
     */
    if (t.club) {
      const reread = writtenName(t.written, t.club, t.facts);
      if (reread !== t.written) unstable.push({ written: t.written, reread });
    }
  }

  return {
    teams: planned.length,
    divisions: cohorts.size,
    homeless,
    shared: [...byName]
      .filter(([, n]) => n > 1)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    mixed: [...cohorts]
      .map(([division, set]) => ({ division, cohorts: [...set].sort() }))
      .filter(({ cohorts: c }) => {
        const years = c.filter((x) => x !== "none").map((x) => x.split("/").map(Number));
        // The widest band is the age group; anything not inside it is another.
        const band = years.reduce((w, y) => (y.length > w.length ? y : w), [] as number[]);
        return years.some((y) => !sameCohort(y, band));
      }),
    unstable,
    clubs: [...clubs]
      .map(([name, teams]) => ({ name, teams }))
      .sort((a, b) => b.teams - a.teams),
  };
}

/**
 * Whether anything here should stop somebody connecting the league.
 *
 * `mixed` is not in the list. A flight holding a team from another age group
 * is usually a club playing a younger squad up — Crossfire enter "XF U7
 * B19-20 RCL 1" in the Sports Affinity U8 flight, and the team's own name is
 * the better authority on what the team is. Worth reading, not worth
 * stopping for. The three that stop things are a club the directory does not
 * have, a name two teams would share, and a name that will not read back as
 * itself.
 */
export function blocking(report: Preflight): boolean {
  return (
    report.homeless.length > 0 || report.shared.length > 0 || report.unstable.length > 0
  );
}
