import { describe, expect, it } from "vitest";

import { laterFixtures, nextFixture, playedAndNext, previewOf, worthShowing } from "./preview";

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

/**
 * A team page is a record, with the next game on the end of it.
 *
 * ECNL publishes a whole season at once, and this team's page carried
 * twenty-four dates running to May above every result it had.
 */
describe("playedAndNext", () => {
  const g = (id: string, iso: string, score: number | null) => ({
    id,
    kickoffAt: new Date(iso),
    homeScore: score,
  });

  it("keeps one fixture ahead, not the whole season", () => {
    const season = [
      g("played", "2026-09-05T17:00:00Z", 2),
      g("next", "2026-09-12T17:00:00Z", null),
      g("later", "2026-09-19T17:00:00Z", null),
      g("may", "2027-05-01T17:00:00Z", null),
    ];
    expect(playedAndNext(season, NOW).map((m) => m.id)).toEqual(["played", "next"]);
  });

  it("keeps the whole weekend, not just Saturday — even seen from Wednesday", () => {
    const day = 24 * 60 * 60 * 1000;
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    const weekend = [
      { id: "sat", kickoffAt: at(9 * day), homeScore: null },
      { id: "sun", kickoffAt: at(10 * day), homeScore: null },
      { id: "far", kickoffAt: at(20 * day), homeScore: null },
    ];
    expect(playedAndNext(weekend, NOW).map((m) => m.id)).toEqual(["sat", "sun"]);
  });

  it("keeps a game that has been played but not filled in", () => {
    // By the clock, not by the score: last Saturday happened, and hiding it
    // would hide the thing somebody most wants to correct.
    const list = [g("unscored", "2026-09-06T17:00:00Z", null), g("ahead", "2026-09-20T17:00:00Z", null)];
    expect(playedAndNext(list, NOW).map((m) => m.id)).toEqual(["unscored", "ahead"]);
  });

  it("takes the soonest ahead, whatever order the list is in", () => {
    // A team page lists newest first, so the season arrives back to front.
    const list = [
      g("may", "2027-05-01T17:00:00Z", null),
      g("soonest", "2026-09-12T17:00:00Z", null),
      g("october", "2026-10-03T17:00:00Z", null),
    ];
    expect(playedAndNext(list, NOW).map((m) => m.id)).toEqual(["soonest"]);
  });

  it("leaves a finished season exactly as it is", () => {
    const list = [g("a", "2026-09-05T17:00:00Z", 1), g("b", "2026-08-29T17:00:00Z", 0)];
    expect(playedAndNext(list, NOW)).toHaveLength(2);
  });

  it("keeps an undated fixture, having no way to call it ahead", () => {
    const list = [{ id: "tbd", kickoffAt: null, homeScore: null }];
    expect(playedAndNext(list, NOW).map((m) => m.id)).toEqual(["tbd"]);
  });
});

describe("laterFixtures", () => {
  const g = (id: string, iso: string | null, score: number | null) => ({
    id,
    kickoffAt: iso ? new Date(iso) : null,
    homeScore: score,
  });

  it("is everything the list leaves out, latest first, undated last", () => {
    const season = [
      g("may", "2027-05-01T17:00:00Z", null),
      g("played", "2026-09-05T17:00:00Z", 2),
      g("tbd1", null, null),
      g("next", "2026-09-12T17:00:00Z", null),
      g("tbd2", null, null),
      g("october", "2026-10-03T17:00:00Z", null),
    ];
    expect(playedAndNext(season, NOW).map((m) => m.id)).toEqual(["played", "tbd1", "next"]);
    expect(laterFixtures(season, NOW).map((m) => m.id)).toEqual(["may", "october", "tbd2"]);
  });

  it("has nothing to add to a finished season", () => {
    expect(laterFixtures([g("a", "2026-09-05T17:00:00Z", 1)], NOW)).toEqual([]);
  });
});

describe("playedAndNext with fixtures that have no date", () => {
  const NOW2 = new Date("2026-09-10T12:00:00Z");
  const undated = (id: string) => ({ id, kickoffAt: null, homeScore: null });

  it("shows one of them, not all of them", () => {
    /*
     * A PacNW side in the Regional Club League listed seventeen in a row,
     * each saying nothing but who it was against. One says the same thing.
     */
    const list = [undated("a"), undated("b"), undated("c"), undated("d")];
    expect(playedAndNext(list, NOW2).map((m) => m.id)).toEqual(["a"]);
  });

  it("keeps the next dated one as well", () => {
    // They answer different questions: when is the next game, and is there
    // more of a season after it.
    const list = [
      { id: "played", kickoffAt: new Date("2026-09-05T16:00:00Z"), homeScore: 2 },
      { id: "next", kickoffAt: new Date("2026-09-12T16:00:00Z"), homeScore: null },
      { id: "later", kickoffAt: new Date("2026-09-19T16:00:00Z"), homeScore: null },
      undated("someday"),
      undated("someday-2"),
    ];
    expect(playedAndNext(list, NOW2).map((m) => m.id)).toEqual([
      "played",
      "next",
      "someday",
    ]);
  });

  it("still shows a game that has happened and has no score", () => {
    // Hiding it would hide the thing somebody most wants to correct.
    const list = [{ id: "unscored", kickoffAt: new Date("2026-09-05T16:00:00Z"), homeScore: null }];
    expect(playedAndNext(list, NOW2).map((m) => m.id)).toEqual(["unscored"]);
  });
});
