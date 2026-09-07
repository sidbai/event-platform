import { describe, expect, it } from "vitest";

import { EMPTY_RECORD, formatRecord, recordFrom, resultFor } from "./record";

const US = "us";
const THEM = "them";
/** Spelled out rather than inferred — a helper that guesses who is playing is
    a helper that quietly writes the team under test into every fixture. */
const game = (
  home: string,
  hs: number | null,
  as: number | null,
  away: string,
) => ({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as });
const played = (home: string, hs: number | null, as: number | null) =>
  game(home, hs, as, home === US ? THEM : US);

describe("resultFor", () => {
  it("reads the game from this team's side of it", () => {
    expect(resultFor(played(US, 3, 1), US)).toEqual({
      for: 3,
      against: 1,
      outcome: "won",
    });
    // The same match, from the other bench.
    expect(resultFor(played(THEM, 3, 1), US)).toEqual({
      for: 1,
      against: 3,
      outcome: "lost",
    });
  });

  it("counts a fixture with no score as not played", () => {
    // A nil-nil that never happened hands both sides a draw they never
    // earned, and this platform holds hundreds of unplayed fixtures.
    expect(resultFor(played(US, null, null), US)).toBeNull();
    expect(resultFor(played(US, 2, null), US)).toBeNull();
  });

  it("ignores a match this team is not in", () => {
    expect(resultFor(game("a", 1, 0, "b"), US)).toBeNull();
  });
});

describe("recordFrom", () => {
  it("adds up the games that were actually played", () => {
    expect(
      recordFrom(
        [
          played(US, 3, 1),
          played(THEM, 0, 2),
          played(US, 1, 1),
          played(US, null, null),
        ],
        US,
      ),
    ).toEqual({ played: 3, won: 2, drawn: 1, lost: 0, gf: 6, ga: 2 });
  });

  it("is empty for a team that has not kicked off", () => {
    expect(recordFrom([played(US, null, null)], US)).toEqual(EMPTY_RECORD);
  });

  it("counts a heavy defeat at its real weight", () => {
    // No cap here. The capped figures exist to stop a 9-0 distorting our own
    // tiebreakers; a team's record is what happened.
    expect(recordFrom([played(US, 0, 10)], US)).toMatchObject({ ga: 10, lost: 1 });
  });
});

describe("formatRecord", () => {
  it("reads the way somebody says it out loud", () => {
    expect(formatRecord({ played: 6, won: 3, drawn: 1, lost: 2, gf: 12, ga: 8 })).toBe(
      "3W 1D 2L · 12–8",
    );
  });
});
