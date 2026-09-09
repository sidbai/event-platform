import { describe, expect, it } from "vitest";

import { honoursByEvent, isFinal, placeIn, type FinalLike } from "./honours";

const base: FinalLike = {
  stage: "group",
  round: null,
  groupLabel: "Final",
  homeTeamId: "us",
  awayTeamId: "them",
  homeScore: 4,
  awayScore: 0,
};

const m = (over: Partial<FinalLike> = {}): FinalLike => ({ ...base, ...over });

describe("isFinal", () => {
  it("reads the two ways a final is written here", () => {
    // An event this platform runs, and an imported one.
    expect(isFinal({ stage: "ko", round: "final", groupLabel: null })).toBe(true);
    expect(isFinal({ stage: "group", round: null, groupLabel: "Final" })).toBe(true);
    expect(isFinal({ stage: "group", round: null, groupLabel: "finals" })).toBe(true);
  });

  it("is not fooled by a semi-final", () => {
    // Athletes2Events writes "Semi-Finals A" in the same field as "Final",
    // and a team knocked out in the semi has not come second.
    expect(isFinal({ stage: "group", round: null, groupLabel: "Semi-Finals A" })).toBe(
      false,
    );
    expect(isFinal({ stage: "ko", round: "semi", groupLabel: null })).toBe(false);
  });

  it("says no to an ordinary group game", () => {
    expect(isFinal({ stage: "group", round: null, groupLabel: "Gold 2" })).toBe(false);
    expect(isFinal({ stage: "group", round: null, groupLabel: null })).toBe(false);
  });
});

describe("placeIn", () => {
  it("crowns the winner, from either side of the fixture", () => {
    expect(placeIn(m(), "us")).toBe("champion");
    expect(placeIn(m(), "them")).toBe("runner-up");
    expect(placeIn(m({ homeScore: 0, awayScore: 4 }), "us")).toBe("runner-up");
    expect(placeIn(m({ homeScore: 0, awayScore: 4 }), "them")).toBe("champion");
  });

  it("says nothing about a final not played yet", () => {
    expect(placeIn(m({ homeScore: null, awayScore: null }), "us")).toBeNull();
  });

  it("says nothing about a final that ended level", () => {
    // Decided on penalties, which this does not hold — and a page naming the
    // wrong champion is worse than one that says nothing.
    expect(placeIn(m({ homeScore: 2, awayScore: 2 }), "us")).toBeNull();
  });

  it("says nothing about a team that was not in it", () => {
    expect(placeIn(m(), "someone-else")).toBeNull();
  });

  it("says nothing about a game that is not a final", () => {
    expect(placeIn(m({ groupLabel: "Group Match" }), "us")).toBeNull();
  });
});

describe("honoursByEvent", () => {
  it("keys what a team won by the event it won it at", () => {
    const out = honoursByEvent(
      [
        { ...m(), eventId: "labor-day" },
        { ...m({ homeScore: 0, awayScore: 1 }), eventId: "zipfizz" },
        { ...m({ groupLabel: "Gold 1" }), eventId: "surf-cup" },
      ],
      "us",
    );
    expect(out.get("labor-day")).toBe("champion");
    expect(out.get("zipfizz")).toBe("runner-up");
    expect(out.has("surf-cup")).toBe(false);
  });

  it("keeps the trophy when the same event also gave a runner-up", () => {
    const out = honoursByEvent(
      [
        { ...m({ homeScore: 1, awayScore: 3 }), eventId: "cup" },
        { ...m(), eventId: "cup" },
      ],
      "us",
    );
    expect(out.get("cup")).toBe("champion");
  });
});
