/**
 * Building a league season's fixtures.
 *
 * A tournament is a weekend someone can type in by hand. A league is dozens of
 * matches across months, and entering them one at a time is why nobody would
 * run a season on this. The arithmetic is the circle method, which is old and
 * well understood — the value here is that it is pure, so the properties that
 * matter can be asserted rather than eyeballed on a page of fixtures.
 */

export type Pairing = { homeTeamId: string; awayTeamId: string };
export type Round = { round: number; pairings: Pairing[] };

/** Stands in for the team that sits out when the count is odd. */
const BYE = "__bye__";

/**
 * Every team plays every other once per leg.
 *
 * With an odd number of teams one sits out each round. That is a real bye
 * rather than an error, which is why the list is padded and the round count
 * comes out the same either way.
 *
 * Home and away alternate by round so a team does not take every fixture at
 * home, and the second leg reverses the first, so a two-leg season is balanced
 * by construction rather than by luck.
 */
export function roundRobin(teamIds: string[], legs: 1 | 2 = 1): Round[] {
  const teams = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(BYE);

  const half = teams.length / 2;
  const rotating = teams.slice(1);
  const rounds: Round[] = [];

  for (let leg = 0; leg < legs; leg++) {
    for (let r = 0; r < teams.length - 1; r++) {
      const left = [teams[0], ...rotating.slice(0, half - 1)];
      const right = rotating.slice(half - 1).reverse();

      const pairings: Pairing[] = [];
      for (let i = 0; i < half; i++) {
        const a = left[i];
        const b = right[i];
        if (a === BYE || b === BYE) continue;
        const homeFirst = (r % 2 === 0) !== (leg === 1);
        pairings.push(
          homeFirst
            ? { homeTeamId: a, awayTeamId: b }
            : { homeTeamId: b, awayTeamId: a },
        );
      }

      rounds.push({ round: rounds.length + 1, pairings });
      rotating.unshift(rotating.pop()!);
    }
  }

  return rounds;
}

/**
 * The date each round is played on.
 *
 * Rounds land a fixed number of days apart from a start date — weekly by
 * default, which is what a Saturday league does. Returned as YYYY-MM-DD, since
 * the caller pairs it with a kickoff time and turns the two into an instant in
 * the league's own timezone. Doing that here in UTC would push Sunday evening
 * fixtures into Monday.
 */
export function matchdayDates(
  startISO: string,
  roundCount: number,
  everyDays = 7,
): string[] {
  const [y, m, d] = startISO.split("-").map(Number);
  if (!y || !m || !d) return [];
  const out: string[] = [];
  for (let i = 0; i < roundCount; i++) {
    out.push(new Date(Date.UTC(y, m - 1, d + i * everyDays)).toISOString().slice(0, 10));
  }
  return out;
}
