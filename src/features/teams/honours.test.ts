import { describe, expect, it } from "vitest";

import {
  honoursByEvent,
  isFinal,
  isKnockoutDivision,
  placeIn,
  tableChampion,
  type FinalLike,
} from "./honours";

const base: FinalLike = {
  stage: "group",
  round: null,
  groupLabel: "Final",
  divisionId: "d1",
  division: { name: "Boys-U19 - Gold" },
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

describe("a knockout division", () => {
  /** EventConnect: the round is the division, beside the group divisions. */
  const champs = (over: Partial<FinalLike> = {}) => ({
    ...m({
      groupLabel: null,
      divisionId: "champs",
      division: { name: "Boys U12 Championships" },
      ...over,
    }),
    eventId: "spring-classic",
  });

  it("is recognised by name", () => {
    expect(isKnockoutDivision("Boys U12 Championships")).toBe(true);
    expect(isKnockoutDivision("Girls U10 Championship")).toBe(true);
    expect(isKnockoutDivision("Boys U12 Red")).toBe(false);
    expect(isKnockoutDivision(null)).toBe(false);
  });

  it("crowns the winner of the one game played there", () => {
    // The report that started this: Warriors B14/15 EA won 2026 Starfire
    // Spring Classic in "Boys U12 Championships" and the page said nothing.
    const out = honoursByEvent([champs()], "us");
    expect(out.get("spring-classic")).toBe("champion");
    expect(honoursByEvent([champs()], "them")).toEqual(
      new Map([["spring-classic", "runner-up"]]),
    );
  });

  it("keeps the group games out of it", () => {
    const groupGame = {
      ...m({ groupLabel: "A", divisionId: "d1", division: { name: "Boys U12 Silver" } }),
      eventId: "spring-classic",
    };
    const out = honoursByEvent([groupGame, champs()], "us");
    expect(out.get("spring-classic")).toBe("champion");
  });

  it("says nothing when the team played that division more than once", () => {
    /*
     * The guard. A name is a weak signal, so a tournament that called its
     * GROUP stage "Championship Division" would otherwise hand a trophy to
     * whoever won their last group game. Two decided games there is a group.
     */
    const out = honoursByEvent([champs(), champs({ homeScore: 2, awayScore: 1 })], "us");
    expect(out.size).toBe(0);
  });

  it("does not count an unplayed game towards that", () => {
    // Imported brackets carry empty rows for flights nobody reached; they
    // must not make a real final look like a group.
    const out = honoursByEvent(
      [champs(), champs({ homeScore: null, awayScore: null })],
      "us",
    );
    expect(out.get("spring-classic")).toBe("champion");
  });
});

describe("a round robin with no final", () => {
  /** A weekend flight of four: everyone plays everyone, nobody plays a final. */
  const game = (home: string, away: string, hs: number, as: number, over: Partial<FinalLike> = {}) => ({
    ...m({ groupLabel: null, divisionId: "gold", division: { name: "GU11 - A-Gold" }, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, ...over }),
    eventId: "rainier",
  });
  const flight = [
    game("us", "a", 5, 0),
    game("b", "us", 0, 1),
    game("us", "c", 7, 0),
    game("a", "b", 2, 1),
    game("c", "a", 1, 3),
    game("b", "c", 3, 0),
  ];

  it("crowns the team clear at the top of the table", () => {
    expect(tableChampion(flight)).toEqual({ champion: "us", runnerUp: "a" });
    const out = honoursByEvent(flight.filter((g) => g.homeTeamId === "us" || g.awayTeamId === "us"), "us", flight);
    expect(out.get("rainier")).toBe("champion");
    expect(honoursByEvent([], "a", flight).get("rainier")).toBe("runner-up");
    expect(honoursByEvent([], "b", flight).has("rainier")).toBe(false);
  });

  it("declines a table where the top is tied on points", () => {
    // us and a draw: both on seven.
    const tied = flight.map((g) => (g.homeTeamId === "us" && g.awayTeamId === "a" ? { ...g, homeScore: 1, awayScore: 1 } : g));
    expect(tableChampion(tied)).toBeNull();
  });

  it("says nothing while a game is still to be played", () => {
    const open = [...flight.slice(0, -1), { ...flight[5], homeScore: null, awayScore: null }];
    expect(tableChampion(open)).toBeNull();
  });

  it("leaves a division with a final to the final", () => {
    const withFinal = [...flight, game("us", "a", 2, 3, { groupLabel: "Final" })];
    expect(tableChampion(withFinal)).toBeNull();
    // The final says a was champion, and the table does not get a second vote.
    expect(honoursByEvent(withFinal, "us", withFinal).get("rainier")).toBe("runner-up");
  });

  it("names nobody where a side is a placeholder", () => {
    expect(tableChampion([...flight, game("us", "", 1, 0, { awayTeamId: null })])).toBeNull();
  });
});
