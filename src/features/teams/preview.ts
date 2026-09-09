import {
  commonOpponents,
  formOf,
  opponentsOf,
  perGame,
  performanceOf,
  type CommonOpponent,
  type Dated,
  type Outcome,
  type PerGame,
  type Performance,
} from "./performance";

export type { Outcome } from "./performance";

/**
 * The next game, and what the two sides bring to it.
 *
 * Built from results alone, which is all a schedule gives us. Every figure is
 * one both sides are measured by, so the block reads as a comparison rather
 * than as a claim about who will win — there is no prediction here and no
 * probability, because 4.6 games a side does not support one.
 *
 * Common opponents carry most of the weight. Two teams here have played each
 * other 7.5% of the time, but 80% of pairings share a third team, and what
 * each did against the same opponent says more than either one's own average
 * — without a model, and in a form a parent can check.
 */

export type Fixture = Dated & { id: string };

/**
 * The next game with no score on it.
 *
 * A fixture is "next" by kick-off, not by position in a list: an imported
 * schedule arrives in whatever order the platform published it, and a
 * postponed game can sit between two that have been played. Anything already
 * scored is behind us whatever its date says.
 */
export function nextFixture<T extends Fixture>(
  matches: T[],
  now: Date = new Date(),
): T | null {
  const upcoming = matches
    .filter((m) => m.homeScore === null && m.awayScore === null)
    .filter((m) => m.kickoffAt !== null && new Date(m.kickoffAt) >= now)
    .sort((a, b) => new Date(a.kickoffAt!).getTime() - new Date(b.kickoffAt!).getTime());
  return upcoming[0] ?? null;
}

export type Side = {
  teamId: string;
  performance: Performance;
  perGame: PerGame | null;
  form: Outcome[];
};

export type Preview = {
  ours: Side;
  theirs: Side;
  /** Times the two have met, most recent first. Empty for most pairings. */
  headToHead: { for: number; against: number; result: Outcome }[];
  shared: CommonOpponent[];
};

function sideOf(matches: Dated[], teamId: string): Side {
  const performance = performanceOf(matches, teamId);
  return {
    teamId,
    performance,
    perGame: perGame(performance),
    form: formOf(matches, teamId),
  };
}

export function previewOf(
  us: { teamId: string; matches: Dated[] },
  them: { teamId: string; matches: Dated[] },
): Preview {
  const ourOpponents = opponentsOf(us.matches, us.teamId);
  const theirOpponents = opponentsOf(them.matches, them.teamId);

  return {
    ours: sideOf(us.matches, us.teamId),
    theirs: sideOf(them.matches, them.teamId),
    // Their own games against each other, which are in both lists already.
    headToHead: ourOpponents
      .filter((o) => o.teamId === them.teamId)
      .map((o) => ({ for: o.for, against: o.against, result: o.result })),
    /*
     * Each other excluded: a game the two played is head to head, and
     * counting it again under "common opponents" would say the same thing
     * twice in two different voices.
     */
    shared: commonOpponents(
      ourOpponents.filter((o) => o.teamId !== them.teamId),
      theirOpponents.filter((o) => o.teamId !== us.teamId),
    ),
  };
}

/** Whether there is enough on either side to be worth showing at all. */
export function worthShowing(preview: Preview): boolean {
  return (
    preview.ours.performance.played > 0 ||
    preview.theirs.performance.played > 0 ||
    preview.shared.length > 0
  );
}

/**
 * Everything already played, plus the next fixture and no more.
 *
 * A season's fixtures are published all at once. A team's page carried
 * twenty-four ECNL dates running to May above every result it had, so its
 * record was three screens down — and the rest of a fixture list is the
 * event's to show, where it can be read a round at a time.
 *
 * "Already played" is by the clock and not by the score. A game last Saturday
 * that nobody has filled in yet has happened, and hiding it would hide the
 * thing somebody most wants to correct.
 *
 * The next one stays in the list rather than being left to the panel above
 * it: that panel says more, but it only renders when the opponent resolves to
 * a team here, and the list should stand on its own.
 */
export function playedAndNext<T extends { kickoffAt: Date | null; homeScore: number | null }>(
  matches: T[],
  now: Date = new Date(),
): T[] {
  const ahead = (m: T) =>
    m.homeScore === null && m.kickoffAt !== null && m.kickoffAt.getTime() > now.getTime();

  const next = matches
    .filter(ahead)
    .sort((a, b) => a.kickoffAt!.getTime() - b.kickoffAt!.getTime())[0];

  return matches.filter((m) => !ahead(m) || m === next);
}
