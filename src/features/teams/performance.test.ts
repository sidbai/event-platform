import { describe, expect, it } from "vitest";

import {
  commonOpponents,
  formOf,
  opponentsOf,
  perGame,
  performanceOf,
} from "./performance";

const US = "us";
const THEM = "them";

/** A played game, from our side: we scored `f`, they scored `a`. */
function game(f: number, a: number, day = 1, opponent = THEM, home = true) {
  return {
    homeTeamId: home ? US : opponent,
    awayTeamId: home ? opponent : US,
    homeScore: home ? f : a,
    awayScore: home ? a : f,
    kickoffAt: new Date(`2026-06-${String(day).padStart(2, "0")}T17:00:00Z`),
  };
}

describe("performanceOf", () => {
  it("counts the two things a goals total cannot show", () => {
    // 6-0, 0-3, 1-1: three games, six goals for, four against. The totals say
    // nothing about a side that shuts one team out and is beaten by another.
    const games = [game(6, 0, 1), game(0, 3, 2), game(1, 1, 3)];
    expect(performanceOf(games, US)).toMatchObject({
      played: 3,
      won: 1,
      drawn: 1,
      lost: 1,
      gf: 7,
      ga: 4,
      cleanSheets: 1,
      scoredIn: 2,
      bestWin: 6,
      worstLoss: 3,
    });
  });

  it("has no best win or worst loss until there is one", () => {
    expect(performanceOf([game(1, 1)], US)).toMatchObject({
      bestWin: null,
      worstLoss: null,
      cleanSheets: 0,
      scoredIn: 1,
    });
  });

  it("counts a nil-nil as a clean sheet and not as having scored", () => {
    expect(performanceOf([game(0, 0)], US)).toMatchObject({
      cleanSheets: 1,
      scoredIn: 0,
      drawn: 1,
    });
  });

  it("ignores a fixture nobody has played", () => {
    const fixture = {
      homeTeamId: US,
      awayTeamId: THEM,
      homeScore: null,
      awayScore: null,
      kickoffAt: new Date("2026-07-01T17:00:00Z"),
    };
    expect(performanceOf([game(2, 0), fixture], US).played).toBe(1);
  });

  it("reads the away side of a game the same way round", () => {
    // Scored 1, conceded 3, playing away.
    expect(performanceOf([game(1, 3, 1, THEM, false)], US)).toMatchObject({
      lost: 1,
      gf: 1,
      ga: 3,
      worstLoss: 2,
    });
  });
});

describe("perGame", () => {
  it("divides by the games actually played", () => {
    const record = performanceOf([game(6, 0, 1), game(0, 3, 2), game(1, 1, 3)], US);
    expect(perGame(record)).toEqual({ gf: 2.3, ga: 1.3, gd: 1 });
  });

  it("has nothing to divide by before the first game", () => {
    expect(perGame(performanceOf([], US))).toBeNull();
  });
});

describe("formOf", () => {
  it("reads most recent first, whatever order the list came in", () => {
    // A team page lists its matches oldest first, and a form line read that
    // way round says the opposite of what it means.
    const games = [game(2, 0, 1), game(0, 1, 2), game(1, 1, 3), game(3, 2, 4)];
    expect(formOf(games, US)).toEqual(["won", "drawn", "lost", "won"]);
  });

  it("keeps to the last few", () => {
    const games = [1, 2, 3, 4, 5, 6].map((d) => game(1, 0, d));
    expect(formOf(games, US, 3)).toHaveLength(3);
  });

  it("leaves out fixtures that have not been played", () => {
    // A schedule running ahead of the scores would otherwise push the real
    // results out of view.
    const games = [
      game(2, 0, 1),
      { homeTeamId: US, awayTeamId: THEM, homeScore: null, awayScore: null, kickoffAt: new Date("2026-07-05T17:00:00Z") },
    ];
    expect(formOf(games, US)).toEqual(["won"]);
  });
});

describe("commonOpponents", () => {
  it("finds the third team both sides have played", () => {
    // Two sides have met each other 7.5% of the time here, but 80% of
    // pairings share an opponent. This is what a preview can say instead.
    const ours = opponentsOf([game(1, 3, 2, "crossfire"), game(4, 0, 1, "someone-else")], US);
    const theirs = opponentsOf(
      [
        {
          homeTeamId: "rival",
          awayTeamId: "crossfire",
          homeScore: 2,
          awayScore: 2,
          kickoffAt: new Date("2026-06-03T17:00:00Z"),
        },
      ],
      "rival",
    );

    const shared = commonOpponents(ours, theirs);
    expect(shared).toHaveLength(1);
    expect(shared[0].teamId).toBe("crossfire");
    expect(shared[0].ours[0]).toMatchObject({ result: "lost", for: 1, against: 3 });
    expect(shared[0].theirs[0]).toMatchObject({ result: "drawn", for: 2, against: 2 });
  });

  it("is empty when the two have nobody in common", () => {
    const ours = opponentsOf([game(1, 0, 1, "a")], US);
    const theirs = opponentsOf(
      [{ homeTeamId: "rival", awayTeamId: "b", homeScore: 1, awayScore: 0, kickoffAt: null }],
      "rival",
    );
    expect(commonOpponents(ours, theirs)).toEqual([]);
  });
});
