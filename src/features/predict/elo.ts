/**
 * Who is likely to win, from who beat whom.
 *
 * An Elo rating per team, learned from every decided game in the order it
 * was played, with the margin counting: a 5–0 says more than a 1–0, though
 * not five times as much (square root). Nothing about age or gender is
 * modelled because nothing needs to be — teams only ever meet their own
 * cohort, so the ratings separate on their own.
 *
 * The draw is the third outcome, taken out of the middle: two level sides
 * draw often, a mismatch almost never. The share and the K were read off a
 * replay of 2,649 tournament games where both sides already had history —
 * 64% of results called against 48% for the base rates, Brier 0.50 against
 * 0.59 (scripts/predict-eval.ts reports this again after any change).
 *
 * Shown only when both sides have played MIN_GAMES here. A number that looks
 * like a forecast is read as one, and three games is the least it takes to
 * be worth reading.
 */

export const INITIAL = 1500;
export const K = 60;
export const MARGIN_POW = 0.5;
export const DRAW_SHARE = 0.22;
export const MIN_GAMES = 3;

export type Rating = { rating: number; games: number };

export type Decided = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type Probs = { home: number; draw: number; away: number };

/** The home side's expected score, 0–1, before the draw is taken out. */
export function expected(home: number, away: number): number {
  return 1 / (1 + 10 ** ((away - home) / 400));
}

/** Win, draw and loss for the home side, summing to one. */
export function probabilities(home: number, away: number): Probs {
  const e = expected(home, away);
  // Level sides draw the most; the further apart, the less room for one.
  const draw = DRAW_SHARE * (1 - Math.abs(2 * e - 1));
  return { home: e * (1 - draw), draw, away: (1 - e) * (1 - draw) };
}

/** Both ratings after one game. */
export function settle(home: number, away: number, homeScore: number, awayScore: number) {
  const e = expected(home, away);
  const s = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
  const margin = Math.max(1, Math.abs(homeScore - awayScore)) ** MARGIN_POW;
  const delta = K * margin * (s - e);
  return { home: home + delta, away: away - delta };
}

/**
 * Every team's rating after all of these games, played in the order given.
 *
 * Order matters — a rating is a running estimate, and a season replayed
 * backwards learns the wrong lesson from every game. The caller sorts by
 * kickoff; games without one are not here at all.
 */
export function rate(games: Decided[]): Map<string, Rating> {
  const out = new Map<string, Rating>();
  const get = (id: string) => out.get(id) ?? { rating: INITIAL, games: 0 };
  for (const g of games) {
    const h = get(g.homeTeamId);
    const a = get(g.awayTeamId);
    const after = settle(h.rating, a.rating, g.homeScore, g.awayScore);
    out.set(g.homeTeamId, { rating: after.home, games: h.games + 1 });
    out.set(g.awayTeamId, { rating: after.away, games: a.games + 1 });
  }
  return out;
}

/** A forecast for a fixture, or null where either side has too little history. */
export function forecast(home: Rating | undefined, away: Rating | undefined): Probs | null {
  if (!home || !away || home.games < MIN_GAMES || away.games < MIN_GAMES) return null;
  return probabilities(home.rating, away.rating);
}

export type Outcome = "home" | "draw" | "away";

export function outcomeOf(homeScore: number, awayScore: number): Outcome {
  return homeScore > awayScore ? "home" : homeScore === awayScore ? "draw" : "away";
}

/**
 * How the model would have done, replaying the games it learned from.
 *
 * Each game is forecast from the ratings as they stood before it, then
 * learned from — so no game is scored on knowledge of itself. Only games
 * both sides came into with MIN_GAMES count, the same rule as on the page;
 * the base rates are the whole set's, which flatters the baseline, not us.
 */
export function replay(games: Decided[]) {
  const ratings = new Map<string, Rating>();
  const get = (id: string) => ratings.get(id) ?? { rating: INITIAL, games: 0 };
  const counts = { home: 0, draw: 0, away: 0 };
  for (const g of games) counts[outcomeOf(g.homeScore, g.awayScore)]++;
  const n = games.length || 1;
  const base: Probs = { home: counts.home / n, draw: counts.draw / n, away: counts.away / n };
  const pick = (p: Probs): Outcome =>
    p.home >= p.draw && p.home >= p.away ? "home" : p.draw >= p.away ? "draw" : "away";
  const brierOf = (p: Probs, o: Outcome) =>
    (["home", "draw", "away"] as const).reduce((s, k) => s + (p[k] - (k === o ? 1 : 0)) ** 2, 0);

  let scored = 0, correct = 0, correctBase = 0, brier = 0, brierBase = 0;
  for (const g of games) {
    const h = get(g.homeTeamId);
    const a = get(g.awayTeamId);
    const p = forecast(h, a);
    if (p) {
      const o = outcomeOf(g.homeScore, g.awayScore);
      scored++;
      if (pick(p) === o) correct++;
      if (pick(base) === o) correctBase++;
      brier += brierOf(p, o);
      brierBase += brierOf(base, o);
    }
    const after = settle(h.rating, a.rating, g.homeScore, g.awayScore);
    ratings.set(g.homeTeamId, { rating: after.home, games: h.games + 1 });
    ratings.set(g.awayTeamId, { rating: after.away, games: a.games + 1 });
  }
  return {
    games: games.length,
    scored,
    accuracy: scored ? correct / scored : 0,
    accuracyBase: scored ? correctBase / scored : 0,
    brier: scored ? brier / scored : 0,
    brierBase: scored ? brierBase / scored : 0,
    base,
  };
}
