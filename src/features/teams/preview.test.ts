import { describe, expect, it } from "vitest";

import { nextFixture, previewOf, worthShowing } from "./preview";

const US = "us";
const THEM = "them";
const NOW = new Date("2026-09-09T12:00:00Z");

function played(f: number, a: number, day: number, opponent = THEM, id = `m${day}`) {
  return {
    id,
    homeTeamId: US,
    awayTeamId: opponent,
    homeScore: f,
    awayScore: a,
    kickoffAt: new Date(`2026-08-${String(day).padStart(2, "0")}T17:00:00Z`),
  };
}

function fixture(day: number, id = `f${day}`, opponent = THEM) {
  return {
    id,
    homeTeamId: US,
    awayTeamId: opponent,
    homeScore: null,
    awayScore: null,
    kickoffAt: new Date(`2026-09-${String(day).padStart(2, "0")}T17:00:00Z`),
  };
}

describe("nextFixture", () => {
  it("takes the soonest game nobody has played", () => {
    expect(nextFixture([fixture(20), fixture(12), fixture(30)], NOW)?.id).toBe("f12");
  });

  it("is by kick-off, not by position in the list", () => {
    // An imported schedule arrives in whatever order the platform published
    // it, and a postponed game can sit between two already played.
    const list = [fixture(25, "later"), played(1, 0, 20), fixture(11, "sooner")];
    expect(nextFixture(list, NOW)?.id).toBe("sooner");
  });

  it("passes over a game that has been played, whatever its date says", () => {
    const scoredButDated = { ...fixture(15, "scored"), homeScore: 2, awayScore: 1 };
    expect(nextFixture([scoredButDated, fixture(20, "real")], NOW)?.id).toBe("real");
  });

  it("has nothing to show once the last game is behind us", () => {
    expect(nextFixture([played(1, 0, 20)], NOW)).toBeNull();
    expect(nextFixture([], NOW)).toBeNull();
  });

  it("ignores a fixture with no kick-off time, having no way to order it", () => {
    const undated = { ...fixture(12, "undated"), kickoffAt: null };
    expect(nextFixture([undated], NOW)).toBeNull();
  });
});

describe("previewOf", () => {
  it("measures both sides the same way", () => {
    const ours = [played(3, 0, 1), played(1, 2, 8)];
    const theirs = [
      { id: "t1", homeTeamId: THEM, awayTeamId: "other", homeScore: 1, awayScore: 1, kickoffAt: new Date("2026-08-02T17:00:00Z") },
    ];

    const preview = previewOf({ teamId: US, matches: ours }, { teamId: THEM, matches: theirs });

    expect(preview.ours.performance).toMatchObject({ played: 2, won: 1, lost: 1, gf: 4, ga: 2 });
    expect(preview.ours.perGame).toEqual({ gf: 2, ga: 1, gd: 1 });
    expect(preview.ours.form).toEqual(["lost", "won"]);
    expect(preview.theirs.performance).toMatchObject({ played: 1, drawn: 1 });
  });

  it("finds the games the two have played each other", () => {
    const ours = [played(3, 0, 1), played(1, 2, 8)];
    const preview = previewOf(
      { teamId: US, matches: ours },
      { teamId: THEM, matches: ours },
    );
    expect(preview.headToHead).toEqual([
      { for: 1, against: 2, result: "lost" },
      { for: 3, against: 0, result: "won" },
    ]);
  });

  it("does not count a head-to-head game as a common opponent too", () => {
    // It would otherwise say the same thing twice in two different voices.
    const ours = [played(3, 0, 1)];
    const preview = previewOf(
      { teamId: US, matches: ours },
      { teamId: THEM, matches: ours },
    );
    expect(preview.headToHead).toHaveLength(1);
    expect(preview.shared).toEqual([]);
  });

  it("lines up what each did against the same third team", () => {
    // The point of the whole block: two sides have met each other 7.5% of the
    // time, but 80% of pairings share an opponent.
    const ours = [played(1, 3, 5, "crossfire")];
    const theirs = [
      { id: "t1", homeTeamId: THEM, awayTeamId: "crossfire", homeScore: 2, awayScore: 2, kickoffAt: new Date("2026-08-06T17:00:00Z") },
    ];

    const preview = previewOf({ teamId: US, matches: ours }, { teamId: THEM, matches: theirs });

    expect(preview.shared).toHaveLength(1);
    expect(preview.shared[0].teamId).toBe("crossfire");
    expect(preview.shared[0].ours[0]).toMatchObject({ result: "lost", for: 1, against: 3 });
    expect(preview.shared[0].theirs[0]).toMatchObject({ result: "drawn", for: 2, against: 2 });
  });
});

describe("worthShowing", () => {
  it("is false when neither side has played and they share nobody", () => {
    // Which is most of a tournament's teams on the day it is imported.
    const empty = previewOf({ teamId: US, matches: [] }, { teamId: THEM, matches: [] });
    expect(worthShowing(empty)).toBe(false);
  });

  it("is true as soon as one side has a result", () => {
    const preview = previewOf(
      { teamId: US, matches: [played(1, 0, 1, "other")] },
      { teamId: THEM, matches: [] },
    );
    expect(worthShowing(preview)).toBe(true);
  });
});
