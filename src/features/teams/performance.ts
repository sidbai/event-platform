import { resultFor, type Playable, type TeamRecord } from "./record";

/**
 * What a team's results say about how it has been going.
 *
 * record.ts counts what happened — won, drawn, lost, goals. This is the layer
 * above: the same facts per game, and the two things a scoreline says that a
 * total does not. A side that wins 6–0 and loses 0–3 has the same goal
 * difference as one that wins 2–1 twice and loses 1–3, and they are not the
 * same team.
 *
 * Deliberately no rating out of 100. Teams here average 4.6 recorded games —
 * 6% have reached ten — and a number fitted to five observations, printed
 * beside another team's number fitted to four, claims a difference the games
 * cannot support. Same reason record.ts leaves points out: wins, draws and
 * goals are facts, a rating is an interpretation. Everything below carries
 * `played` so a caller can say how much is behind it.
 */

export type Outcome = "won" | "drawn" | "lost";

export type Performance = TeamRecord & {
  /** Games it conceded none — what a total goals-against cannot show. */
  cleanSheets: number;
  /** Games it scored in. The other half of the same question. */
  scoredIn: number;
  /** The widest margins either way, which the averages flatten out. */
  bestWin: number | null;
  worstLoss: number | null;
};

export const EMPTY_PERFORMANCE: Performance = {
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  cleanSheets: 0,
  scoredIn: 0,
  bestWin: null,
  worstLoss: null,
};

export function performanceOf(matches: Playable[], teamId: string): Performance {
  const out: Performance = { ...EMPTY_PERFORMANCE };

  for (const match of matches) {
    const result = resultFor(match, teamId);
    if (!result) continue;
    out.played++;
    out[result.outcome]++;
    out.gf += result.for;
    out.ga += result.against;
    if (result.against === 0) out.cleanSheets++;
    if (result.for > 0) out.scoredIn++;

    const margin = result.for - result.against;
    if (margin > 0) out.bestWin = Math.max(out.bestWin ?? 0, margin);
    if (margin < 0) out.worstLoss = Math.max(out.worstLoss ?? 0, -margin);
  }

  return out;
}

export type PerGame = { gf: number; ga: number; gd: number };

/**
 * Goals per game, or null when there are no games to divide by.
 *
 * Rounded to one place at the edge rather than left long: "2.8" is what the
 * games support, and 2.8333333 reads as a precision four matches do not have.
 */
export function perGame(record: TeamRecord): PerGame | null {
  if (record.played === 0) return null;
  const round = (n: number) => Math.round((n / record.played) * 10) / 10;
  return {
    gf: round(record.gf),
    ga: round(record.ga),
    gd: round(record.gf - record.ga),
  };
}

export type Dated = Playable & { kickoffAt: Date | string | null };

const at = (m: Dated) => (m.kickoffAt ? new Date(m.kickoffAt).getTime() : 0);

/**
 * How the last few went, most recent first.
 *
 * Ordered here rather than trusting the caller: a team page lists its matches
 * oldest first and a form line read in that order says the opposite of what it
 * means. Fixtures with no score are not in it — an unplayed game is not a
 * result, and a schedule that runs ahead of the scores would otherwise push
 * the real ones out of view.
 */
export function formOf(matches: Dated[], teamId: string, limit = 5): Outcome[] {
  return [...matches]
    .filter((m) => resultFor(m, teamId) !== null)
    .sort((a, b) => at(b) - at(a))
    .slice(0, limit)
    .map((m) => resultFor(m, teamId)!.outcome);
}

export type Opponent = { teamId: string; result: Outcome; for: number; against: number };

/**
 * Everyone a team has played, most recent first, one entry per game.
 *
 * The building block for a preview: with teams averaging under five games,
 * two sides have met each other only 7.5% of the time, but 80% of pairings
 * share an opponent. What both did against the same third team says more
 * than either side's own average, and says it without a model.
 */
export function opponentsOf(matches: Dated[], teamId: string): Opponent[] {
  return [...matches]
    .sort((a, b) => at(b) - at(a))
    .flatMap((m) => {
      const result = resultFor(m, teamId);
      if (!result) return [];
      const other = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
      if (!other) return [];
      return [
        { teamId: other, result: result.outcome, for: result.for, against: result.against },
      ];
    });
}

export type CommonOpponent = { teamId: string; ours: Opponent[]; theirs: Opponent[] };

/** The third teams both sides have played, and how each got on against them. */
export function commonOpponents(
  ours: Opponent[],
  theirs: Opponent[],
): CommonOpponent[] {
  const mine = new Map<string, Opponent[]>();
  for (const o of ours) mine.set(o.teamId, [...(mine.get(o.teamId) ?? []), o]);

  const out = new Map<string, CommonOpponent>();
  for (const o of theirs) {
    const ourGames = mine.get(o.teamId);
    if (!ourGames) continue;
    const found = out.get(o.teamId) ?? { teamId: o.teamId, ours: ourGames, theirs: [] };
    found.theirs.push(o);
    out.set(o.teamId, found);
  }
  return [...out.values()];
}
