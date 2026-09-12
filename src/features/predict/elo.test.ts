import { describe, expect, it } from "vitest";

import { forecast, INITIAL, MIN_GAMES, probabilities, rate, replay, settle } from "./elo";

const g = (home: string, away: string, hs: number, as: number) => ({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as });

describe("probabilities", () => {
  it("sum to one, and favour the higher rating", () => {
    const p = probabilities(1600, 1500);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("give level sides the most draws and a mismatch almost none", () => {
    expect(probabilities(1500, 1500).draw).toBeGreaterThan(probabilities(1900, 1500).draw);
    expect(probabilities(1900, 1500).draw).toBeLessThan(0.05);
  });
});

describe("settle", () => {
  it("moves the winner up and the loser down by the same amount", () => {
    const after = settle(1500, 1500, 2, 1);
    expect(after.home).toBeGreaterThan(1500);
    expect(after.home - 1500).toBeCloseTo(1500 - after.away, 10);
  });

  it("moves more for a bigger margin, but less than in proportion", () => {
    const one = settle(1500, 1500, 1, 0).home - 1500;
    const four = settle(1500, 1500, 4, 0).home - 1500;
    expect(four).toBeGreaterThan(one);
    expect(four).toBeLessThan(4 * one);
  });

  it("barely moves an expected result", () => {
    const upset = settle(1500, 1700, 1, 0).home - 1500;
    const expected = settle(1700, 1500, 1, 0).home - 1700;
    expect(upset).toBeGreaterThan(expected);
  });
});

describe("rate", () => {
  it("learns in order, counting games", () => {
    const r = rate([g("a", "b", 3, 0), g("b", "c", 1, 1), g("a", "c", 2, 0)]);
    expect(r.get("a")!.games).toBe(2);
    expect(r.get("a")!.rating).toBeGreaterThan(r.get("c")!.rating);
    expect(r.get("d")).toBeUndefined();
  });
});

describe("forecast", () => {
  it("says nothing until both sides have enough history", () => {
    const thin = { rating: 1600, games: MIN_GAMES - 1 };
    const enough = { rating: 1500, games: MIN_GAMES };
    expect(forecast(thin, enough)).toBeNull();
    expect(forecast(undefined, enough)).toBeNull();
    expect(forecast(enough, enough)).not.toBeNull();
    expect(forecast(enough, { rating: INITIAL, games: 10 })).not.toBeNull();
  });
});

describe("replay", () => {
  it("scores only games both sides came into with history, and beats the base rate on a clear pattern", () => {
    // a beats everybody, everybody else draws: a lopsided little league.
    const games = [];
    for (let round = 0; round < 6; round++) {
      games.push(g("a", "b", 3, 0), g("c", "a", 0, 2), g("b", "c", 1, 1));
    }
    const out = replay(games);
    expect(out.games).toBe(18);
    expect(out.scored).toBeGreaterThan(0);
    expect(out.scored).toBeLessThan(18);
    expect(out.accuracy).toBeGreaterThan(out.accuracyBase);
    expect(out.brier).toBeLessThan(out.brierBase);
  });
});
