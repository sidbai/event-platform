import { describe, expect, it } from "vitest";

import { matchdayDates, roundRobin, type Round } from "./round-robin";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const allPairs = (rounds: Round[]) =>
  rounds.flatMap((r) => r.pairings.map((p) => pairKey(p.homeTeamId, p.awayTeamId)));

describe("roundRobin", () => {
  it("has nothing to schedule for fewer than two teams", () => {
    expect(roundRobin([])).toEqual([]);
    expect(roundRobin(["a"])).toEqual([]);
  });

  it("pairs two teams once", () => {
    const rounds = roundRobin(["a", "b"]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].pairings).toHaveLength(1);
  });

  it("gives every pair exactly one match", () => {
    const teams = ["a", "b", "c", "d", "e", "f"];
    const pairs = allPairs(roundRobin(teams));
    // 6 teams -> 15 distinct pairings, none repeated.
    expect(pairs).toHaveLength(15);
    expect(new Set(pairs).size).toBe(15);
  });

  it("never pairs a team with itself", () => {
    for (const p of roundRobin(["a", "b", "c", "d", "e"]).flatMap((r) => r.pairings)) {
      expect(p.homeTeamId).not.toBe(p.awayTeamId);
    }
  });

  it("plays each team at most once per round", () => {
    // The property that makes a matchday possible at all: nobody is in two
    // places on the same Saturday.
    for (const round of roundRobin(["a", "b", "c", "d", "e", "f", "g"])) {
      const ids = round.pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("rests one team a round when the count is odd, and never invents a bye team", () => {
    const rounds = roundRobin(["a", "b", "c", "d", "e"]);
    expect(rounds).toHaveLength(5);
    for (const round of rounds) {
      expect(round.pairings).toHaveLength(2);
    }
    const ids = new Set(
      rounds.flatMap((r) => r.pairings.flatMap((p) => [p.homeTeamId, p.awayTeamId])),
    );
    expect([...ids].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("still gives every pair one match with an odd count", () => {
    const pairs = allPairs(roundRobin(["a", "b", "c", "d", "e"]));
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs).size).toBe(10);
  });

  it("numbers rounds from one, without gaps", () => {
    const rounds = roundRobin(["a", "b", "c", "d"]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("spreads home fixtures rather than giving one team every one", () => {
    const teams = ["a", "b", "c", "d", "e", "f"];
    const homeCounts = new Map<string, number>();
    for (const p of roundRobin(teams).flatMap((r) => r.pairings)) {
      homeCounts.set(p.homeTeamId, (homeCounts.get(p.homeTeamId) ?? 0) + 1);
    }
    // Five matches each; nobody should be at home for all or none of them.
    for (const t of teams) {
      const n = homeCounts.get(t) ?? 0;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(5);
    }
  });

  it("plays a two-leg season twice, once at each end", () => {
    const teams = ["a", "b", "c", "d"];
    const rounds = roundRobin(teams, 2);
    expect(rounds).toHaveLength(6);
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5, 6]);

    const pairs = allPairs(rounds);
    expect(pairs).toHaveLength(12);
    // Each pairing appears exactly twice across the season.
    for (const count of countBy(pairs).values()) expect(count).toBe(2);

    // And once with each side at home, which is the point of a second leg.
    const directed = rounds.flatMap((r) =>
      r.pairings.map((p) => `${p.homeTeamId}>${p.awayTeamId}`),
    );
    expect(new Set(directed).size).toBe(12);
  });
});

function countBy(values: string[]) {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

describe("matchdayDates", () => {
  it("spaces rounds a week apart by default", () => {
    expect(matchdayDates("2026-09-12", 3)).toEqual([
      "2026-09-12",
      "2026-09-19",
      "2026-09-26",
    ]);
  });

  it("crosses a month boundary correctly", () => {
    expect(matchdayDates("2026-09-26", 2)).toEqual(["2026-09-26", "2026-10-03"]);
  });

  it("takes any gap, for a league that plays fortnightly", () => {
    expect(matchdayDates("2026-09-12", 3, 14)).toEqual([
      "2026-09-12",
      "2026-09-26",
      "2026-10-10",
    ]);
  });

  it("has no dates for no rounds, and refuses a start it cannot read", () => {
    expect(matchdayDates("2026-09-12", 0)).toEqual([]);
    expect(matchdayDates("", 3)).toEqual([]);
  });
});
