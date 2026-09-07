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

describe("points systems", () => {
  it("leaves three-points-for-a-win exactly as it was", () => {
    // The default is not a system anybody selected: every table computed
    // before this option existed must keep the numbers it had.
    const rows = computeStandings([m("a", 2, 1, "b")]);
    expect(rows.get("a")!.points).toBe(3);
    expect(rows.get("b")!.points).toBe(0);
  });

  it("pays a ten-point win its six, its goals and its shutout", () => {
    const rows = computeStandings([m("a", 3, 0, "b")], undefined, {
      system: "ten-point",
    });
    // 6 win + 3 goals + 1 shutout
    expect(rows.get("a")!.points).toBe(10);
    expect(rows.get("b")!.points).toBe(0);
  });

  it("never pays more than ten for one game", () => {
    // The cap is the point of the name. A 9–0 is worth what a 3–0 is worth,
    // which is what stops a team running up the score against the weakest
    // side in the group to win the group.
    const rows = computeStandings([m("a", 9, 0, "b")], undefined, {
      system: "ten-point",
    });
    expect(rows.get("a")!.points).toBe(10);
  });

  it("gives both sides the shutout point in a goalless tie", () => {
    // 3 for the tie + 1 for conceding nothing. Both kept a clean sheet, so
    // both are paid for it — 0–0 is four points each, not three.
    const rows = computeStandings([m("a", 0, 0, "b")], undefined, {
      system: "ten-point",
    });
    expect(rows.get("a")!.points).toBe(4);
    expect(rows.get("b")!.points).toBe(4);
  });

  it("pays a tie its goals too", () => {
    // 3 for the tie + 2 goals, and no shutout for either.
    const rows = computeStandings([m("a", 2, 2, "b")], undefined, {
      system: "ten-point",
    });
    expect(rows.get("a")!.points).toBe(5);
    expect(rows.get("b")!.points).toBe(5);
  });

  it("pays a losing side for the goals it scored", () => {
    // The part coaches notice: losing 3–2 is worth two points, and losing
    // 3–0 is worth none.
    const close = computeStandings([m("a", 3, 2, "b")], undefined, {
      system: "ten-point",
    });
    expect(close.get("b")!.points).toBe(2);
    const heavy = computeStandings([m("a", 3, 0, "b")], undefined, {
      system: "ten-point",
    });
    expect(heavy.get("b")!.points).toBe(0);
  });

  it("crowns a different team from the same results", () => {
    /*
     * Why the option exists at all. Four teams, a full round robin:
     *   A drew 0-0 with B and D, and beat C 2-0.
     *   C lost to A, then beat B 2-1 and D 1-0.
     * Three points a win makes C the champion on six — two wins beat one.
     * The ten-point system pays A for three clean sheets and puts A top by
     * one. Same results, different winner: showing the wrong table does not
     * misplace a decimal, it names the wrong champion.
     */
    const matches = [
      m("a", 0, 0, "b"),
      m("a", 2, 0, "c"),
      m("a", 0, 0, "d"),
      m("b", 1, 2, "c"),
      m("b", 0, 3, "d"),
      m("c", 1, 0, "d"),
    ];
    const ids = ["a", "b", "c", "d"];

    const standard = rankStandings(
      [...computeStandings(matches, ids).values()],
      matches,
    );
    expect(standard[0].teamId).toBe("c");
    expect(standard[0].points).toBe(6);

    const ten = rankStandings(
      [...computeStandings(matches, ids, { system: "ten-point" }).values()],
      matches,
      { system: "ten-point" },
    );
    expect(ten[0].teamId).toBe("a");
    expect(ten[0].points).toBe(17);
    expect(ten[1].teamId).toBe("c");
    expect(ten[1].points).toBe(16);
  });

  it("counts nothing for a game that has not been played", () => {
    const rows = computeStandings(
      [{ homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null }],
      ["a", "b"],
      { system: "ten-point" },
    );
    // A fixture with no score is not a goalless draw, so no shutout point.
    expect(rows.get("a")!.points).toBe(0);
    expect(rows.get("a")!.played).toBe(0);
  });

  it("still honours an explicit points override", () => {
    // Two points for a win is a real thing in old league rules, and it must
    // not silently pick up goal bonuses from the system beside it.
    const rows = computeStandings([m("a", 4, 0, "b")], undefined, {
      points: { win: 2, draw: 1, loss: 0 },
    });
    expect(rows.get("a")!.points).toBe(2);
  });
});
