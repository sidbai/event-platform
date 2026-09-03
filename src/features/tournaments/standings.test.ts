import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeStandings, rankStandings, type MatchResult } from "./standings";

const m = (
  home: string,
  hs: number,
  as: number,
  away: string,
): MatchResult => ({
  homeTeamId: home,
  awayTeamId: away,
  homeScore: hs,
  awayScore: as,
});

describe("computeStandings", () => {
  it("tallies a simple round robin", () => {
    const matches = [m("A", 2, 1, "B"), m("A", 0, 0, "C"), m("B", 3, 1, "C")];
    const table = computeStandings(matches, ["A", "B", "C"]);

    expect(table.get("A")).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, points: 4, gf: 2, ga: 1 });
    expect(table.get("B")).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, points: 3 });
    expect(table.get("C")).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, points: 1, gf: 1, ga: 3 });
  });

  it("seeds teams with no games", () => {
    const table = computeStandings([], ["X", "Y"]);
    expect(table.get("X")).toMatchObject({ played: 0, points: 0 });
    expect(table.size).toBe(2);
  });

  it("caps goal stats per game but not points", () => {
    const table = computeStandings([m("A", 12, 0, "B")], ["A", "B"], { goalCap: 6 });
    const a = table.get("A")!;
    expect(a.gf).toBe(12); // raw kept for display
    expect(a.capGf).toBe(6); // capped for tiebreakers
    expect(a.capGd).toBe(6);
    expect(a.points).toBe(3);
  });

  it("ignores matches with missing scores or teams", () => {
    const matches: MatchResult[] = [
      { homeTeamId: "A", awayTeamId: "B", homeScore: null, awayScore: null },
      { homeTeamId: "A", awayTeamId: null, homeScore: 1, awayScore: 0 },
    ];
    const table = computeStandings(matches, ["A", "B"]);
    expect(table.get("A")!.played).toBe(0);
  });
});

describe("rankStandings", () => {
  it("breaks a two-way tie on head-to-head", () => {
    // A and B both 6 pts; A beat B head-to-head
    const matches = [
      m("A", 1, 0, "B"),
      m("A", 5, 0, "C"),
      m("B", 9, 0, "C"),
    ];
    const table = [...computeStandings(matches, ["A", "B", "C"]).values()];
    const ranked = rankStandings(table, matches);
    expect(ranked.map((r) => r.teamId)).toEqual(["A", "B", "C"]);
  });

  it("falls through head-to-head (draw) to goal difference", () => {
    const matches = [
      m("A", 2, 2, "B"),
      m("A", 1, 0, "C"),
      m("B", 5, 0, "C"),
    ];
    const table = [...computeStandings(matches, ["A", "B", "C"]).values()];
    const ranked = rankStandings(table, matches);
    // A & B tied 4 pts, drew h2h; B has better GD → B first
    expect(ranked[0].teamId).toBe("B");
    expect(ranked[1].teamId).toBe("A");
  });

  it("is deterministic when fully tied (coin toss → teamId)", () => {
    const matches = [m("B", 0, 0, "A")];
    const table = [...computeStandings(matches, ["A", "B"]).values()];
    expect(rankStandings(table, matches).map((r) => r.teamId)).toEqual(["A", "B"]);
  });
});

describe("King Juan Cup 2026 fixture", () => {
  const dir = join(process.cwd(), "data", "king-juan-cup-2026");
  const schedule = JSON.parse(
    readFileSync(join(dir, "schedule.json"), "utf8"),
  ) as { games: { division: string; group: string; home_team: string; away_team: string; home_score: number; away_score: number }[] };

  const grandeGroup1 = schedule.games
    .filter((g) => g.division === "Grande" && g.group === "1")
    .map((g) => m(g.home_team, g.home_score, g.away_score, g.away_team));

  it("Grande Group 1: 喂饼FC top with a perfect record", () => {
    const table = computeStandings(grandeGroup1);
    const ranked = rankStandings([...table.values()], grandeGroup1);
    expect(ranked[0].teamId).toBe("喂饼FC");
    expect(ranked[0]).toMatchObject({ played: 3, won: 3, points: 9 });
    expect(ranked.at(-1)!.teamId).toBe("Warriors GU12");
  });
});
