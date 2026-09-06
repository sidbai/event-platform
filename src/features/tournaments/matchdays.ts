/**
 * Grouping a season's matches into the days they are played on.
 *
 * A tournament is a weekend and fits on one screen; a league runs for months,
 * so its schedule is only readable a matchday at a time. That is what
 * GotSport's date tabs are doing.
 *
 * Pure, and takes the timezone explicitly, because "which day is this match
 * on" is the whole question and it has a different answer in two places. A
 * 7pm Sunday kickoff in Seattle is Monday in UTC, and a league grouped in UTC
 * would put half its Sunday fixtures under the wrong heading.
 */

export type Playable = { id: string; kickoffAt: Date | null };

export type Matchday<T> = {
  /** YYYY-MM-DD in the event's own timezone, for links and keys. */
  key: string;
  matches: T[];
};

/** The calendar day a kickoff falls on, where the match is played. */
export function dayKey(when: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts correctly as a string.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(when);
}

/**
 * Matches by day, earliest first, and each day's matches by kickoff.
 *
 * Matches with no kickoff yet are collected under a single empty key rather
 * than dropped — an unscheduled fixture is still a fixture, and a league that
 * silently hid them would be missing rounds nobody could account for.
 */
export function byMatchday<T extends Playable>(
  matches: T[],
  timeZone: string,
): Matchday<T>[] {
  const days = new Map<string, T[]>();
  for (const m of matches) {
    const key = m.kickoffAt ? dayKey(m.kickoffAt, timeZone) : "";
    const list = days.get(key);
    if (list) list.push(m);
    else days.set(key, [m]);
  }

  return [...days.entries()]
    .sort(([a], [b]) => {
      // Unscheduled last: they have no place in a sequence of dates.
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    })
    .map(([key, list]) => ({
      key,
      matches: list
        .slice()
        .sort(
          (x, y) => (x.kickoffAt?.getTime() ?? 0) - (y.kickoffAt?.getTime() ?? 0),
        ),
    }));
}

/**
 * The matchday a reader should land on: the next one still to come, or the
 * most recent if the season is over.
 *
 * Opening a months-long league on its first round means everyone scrolls.
 */
export function currentMatchday<T extends Playable>(
  days: Matchday<T>[],
  now: Date,
  timeZone: string,
): string | null {
  const dated = days.filter((d) => d.key !== "");
  if (dated.length === 0) return days[0]?.key ?? null;
  const today = dayKey(now, timeZone);
  return dated.find((d) => d.key >= today)?.key ?? dated[dated.length - 1].key;
}
