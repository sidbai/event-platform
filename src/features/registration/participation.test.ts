import { describe, expect, it } from "vitest";

import { participationFor, type Current } from "./participation";

const out: Current = { participating: false, divisionId: null, hasFixtures: false };
const inU13: Current = { participating: true, divisionId: "u13", hasFixtures: false };
const playingU13: Current = { participating: true, divisionId: "u13", hasFixtures: true };

describe("participationFor", () => {
  it("puts an accepted team into the division it entered", () => {
    expect(participationFor("accepted", "u13", out)).toEqual({
      action: "enter",
      divisionId: "u13",
    });
  });

  it("does nothing when accepting a team that is already in that division", () => {
    // Accept is a button an organizer can hit twice. The second press must not
    // rewrite the row, because event_teams carries the standings.
    expect(participationFor("accepted", "u13", inU13)).toEqual({ action: "none" });
  });

  it("moves a team accepted into a different division", () => {
    expect(participationFor("accepted", "u14", inU13)).toEqual({
      action: "enter",
      divisionId: "u14",
    });
  });

  it("takes the team out when the decision goes the other way", () => {
    for (const status of ["waitlisted", "declined", "withdrawn", "requested"] as const) {
      expect(participationFor(status, "u13", inU13)).toEqual({ action: "remove" });
    }
  });

  it("leaves a team that already has fixtures, and says why", () => {
    expect(participationFor("declined", "u13", playingU13)).toEqual({
      action: "keep",
      reason: "has-fixtures",
    });
  });

  it("still enters a team with fixtures when it is being accepted", () => {
    // has-fixtures only ever protects against removal; it must not stop a team
    // from being put back into the division it is already playing in.
    expect(
      participationFor("accepted", "u14", playingU13),
    ).toEqual({ action: "enter", divisionId: "u14" });
  });

  it("has nothing to do for a team that was never in", () => {
    for (const status of ["waitlisted", "declined", "withdrawn", "requested"] as const) {
      expect(participationFor(status, "u13", out)).toEqual({ action: "none" });
    }
  });

  it("enters a team whose row somehow has no division", () => {
    // Teams added by hand on the scores page have a null division. Accepting
    // their entry should file them properly rather than leave them loose.
    expect(
      participationFor("accepted", "u13", {
        participating: true,
        divisionId: null,
        hasFixtures: false,
      }),
    ).toEqual({ action: "enter", divisionId: "u13" });
  });
});
