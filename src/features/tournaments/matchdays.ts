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

/** A match that may know which round of a league it belongs to. */
export type Numbered = Playable & { week?: number | null };

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

/**
 * The same schedule, grouped the way a league counts it.
 *
 * A league reads by round, not by date. The two are not the same list: a
 * round spread over Saturday and Sunday is one week and two matchdays, and a
 * game postponed for weather is played a fortnight after the round it belongs
 * to. Grouped by date, that game turns up alone under a heading in the middle
 * of the season with no way to see what it was.
 *
 * Weeks with no number of their own come last under an empty key, the same
 * way undated matches do above — an imported league whose platform prints no
 * round still has fixtures, and dropping them would lose games nobody could
 * account for.
 */
export function byWeek<T extends Numbered>(matches: T[]): Matchday<T>[] {
  const weeks = new Map<string, T[]>();
  for (const m of matches) {
    const key = typeof m.week === "number" ? String(m.week) : "";
    const list = weeks.get(key);
    if (list) list.push(m);
    else weeks.set(key, [m]);
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return Number(a) - Number(b);
    })
    .map(([key, list]) => ({
      key,
      matches: list
        .slice()
        .sort((x, y) => (x.kickoffAt?.getTime() ?? 0) - (y.kickoffAt?.getTime() ?? 0)),
    }));
}

/** Whether this schedule is numbered by round at all. */
export function hasWeeks(matches: Numbered[]): boolean {
  return matches.some((m) => typeof m.week === "number");
}

/**
 * The week to open on: the one being played, or the next still to come.
 *
 * By the earliest kickoff in each round rather than by the number, since a
 * postponed round can sit later in the calendar than the one after it and a
 * reader opening the page wants the football that is next, not the lowest
 * number left unplayed.
 */
export function currentWeek<T extends Numbered>(
  weeks: Matchday<T>[],
  now: Date,
): string | null {
  const t = now.getTime();
  const starts = (w: Matchday<T>) => {
    const times = w.matches
      .map((m) => m.kickoffAt?.getTime())
      .filter((x): x is number => typeof x === "number");
    return times.length > 0 ? Math.min(...times) : null;
  };

  const dated = weeks
    .map((w) => ({ w, at: starts(w) }))
    .filter((x): x is { w: Matchday<T>; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);
  if (dated.length === 0) return weeks[0]?.key ?? null;

  // A round is "on" until a day after its first kickoff, so Sunday's fixtures
  // do not send the page to next week on Saturday evening.
  const DAY = 86_400_000;
  return (dated.find((x) => x.at + DAY >= t) ?? dated[dated.length - 1]).w.key;
}
