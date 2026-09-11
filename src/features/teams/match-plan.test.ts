import { describe, expect, it } from "vitest";

import { proposeMatches, squadMarks, type MatchCandidate, whyNot } from "./match-plan";

const CLUBS = new Map([
  ["xf", "Crossfire Premier"],
  ["lwpfc", "Lake Washington Premier FC"],
  ["reign", "Seattle Reign Academy"],
]);

let n = 0;
function team(over: Partial<MatchCandidate> & { name: string }): MatchCandidate {
  n += 1;
  return {
    id: `t${n}`,
    slug: `t${n}`,
    clubId: "xf",
    gender: "boys",
    birthYears: [2013, 2014],
    tier: null,
    events: 1,
    matches: 3,
    ...over,
  };
}

const pairs = (list: MatchCandidate[]) =>
  proposeMatches(list, CLUBS).map((p) => [p.a.name, p.b.name]);

describe("proposeMatches", () => {
  it("finds a team whose words were reordered", () => {
    /*
     * The case the exact finder can never see, and the reason this exists:
     * one platform writes the birth years last, another writes them first.
     */
    expect(
      pairs([
        team({ name: "LWPFC B17/18 White Sharks", clubId: "lwpfc", birthYears: [2017, 2018] }),
        team({ name: "LWPFC White Sharks B17/18", clubId: "lwpfc", birthYears: [2017, 2018] }),
      ]),
    ).toEqual([["LWPFC B17/18 White Sharks", "LWPFC White Sharks B17/18"]]);
  });

  it("finds a team one platform gave a longer name", () => {
    expect(
      pairs([
        team({ name: "XF U13 B13/14 RCL 1", tier: "RCL 1" }),
        team({ name: "XF U13 B13/14 RCL 1 - Boys U13", tier: "RCL 1" }),
      ]),
    ).toHaveLength(1);
  });

  it("will not put a club's A side with its B side", () => {
    /*
     * Half their words agree, so similarity alone calls them one team. This
     * was the loudest false positive in the directory: 47 such pairs.
     */
    expect(
      pairs([
        team({ name: "Crossfire Select BU19 A Rasam", birthYears: [2007, 2008] }),
        team({ name: "Crossfire Select BU19 B", birthYears: [2007, 2008] }),
      ]),
    ).toEqual([]);
  });

  it("reads a squad written as a number or a numeral", () => {
    // "U11-2" and "U11-3", "MLS Next II" and "MLS Next" — the same trap.
    expect(
      pairs([
        team({ name: "Seattle Reign Academy U11-2", clubId: "reign" }),
        team({ name: "Seattle Reign Academy U11-3", clubId: "reign" }),
      ]),
    ).toEqual([]);
    expect(
      pairs([
        team({ name: "Seattle Celtic B13 MLS Next II", clubId: "reign" }),
        team({ name: "Seattle Celtic B13 MLS Next", clubId: "reign" }),
      ]),
    ).toEqual([]);
  });

  it("keeps two tiers of one club apart", () => {
    expect(
      pairs([
        team({ name: "XF U16 B10-11 ECNL 2", tier: "ECNL 2" }),
        team({ name: "XF U16 B10-11 ECNL RL", tier: "ECNL RL" }),
      ]),
    ).toEqual([]);
  });

  it("keeps two age groups and two genders apart", () => {
    expect(
      pairs([
        team({ name: "XF White Sharks", birthYears: [2013, 2014] }),
        team({ name: "XF White Sharks", birthYears: [2015, 2016] }),
      ]),
    ).toEqual([]);
    expect(
      pairs([
        team({ name: "XF White Sharks", gender: "boys" }),
        team({ name: "XF White Sharks", gender: "girls" }),
      ]),
    ).toEqual([]);
  });

  it("never proposes across clubs, or for a team with no club", () => {
    // Two clubs in one region both fielding a "Warriors" is the merge
    // nobody can undo.
    expect(
      pairs([
        team({ name: "Warriors B14 Red", clubId: "xf" }),
        team({ name: "Warriors B14 Red", clubId: "lwpfc" }),
      ]),
    ).toEqual([]);
    expect(
      pairs([
        team({ name: "Warriors B14 Red", clubId: null }),
        team({ name: "Warriors B14 Red", clubId: null }),
      ]),
    ).toEqual([]);
  });

  it("lets a missing fact through rather than treating it as a difference", () => {
    // A team imported before the facts were read has no tier. That is not
    // evidence of anything, and blocking on it would hide real duplicates.
    expect(
      pairs([
        team({ name: "XF White Sharks 2013", tier: "RCL 1" }),
        team({ name: "XF White Sharks 2013", tier: null }),
      ]),
    ).toHaveLength(1);
  });

  it("puts the most alike first", () => {
    const out = proposeMatches(
      [
        team({ name: "XF Blue Jays 2013" }),
        team({ name: "XF Blue Jays 2013 Kante" }),
        team({ name: "XF Blue Jays 2013 Kante Reserve Squad" }),
      ],
      CLUBS,
    );
    expect(out[0].score).toBeGreaterThanOrEqual(out[out.length - 1].score);
  });
});

describe("whyNot", () => {
  it("names the reason, since each one was a real false positive", () => {
    expect(
      whyNot(team({ name: "a", tier: "ECNL" }), team({ name: "b", tier: "RCL 1" })),
    ).toBe("different tiers");
    expect(whyNot(team({ name: "a" }), team({ name: "b", clubId: "lwpfc" }))).toBe(
      "different clubs",
    );
  });
});

describe("squadMarks", () => {
  it("reads the marks a club tells its own sides apart by", () => {
    expect(squadMarks("Crossfire Select BU19 A Rasam")).toEqual(new Set(["A"]));
    expect(squadMarks("Seattle Reign Academy U11-2")).toEqual(new Set(["2"]));
    expect(squadMarks("Seattle Celtic B13 MLS Next II")).toEqual(new Set(["II"]));
  });

  it("does not read a letter inside a word as a squad", () => {
    expect(squadMarks("XF Blue Jays 2013")).toEqual(new Set());
    expect(squadMarks("Atletico BU9 Oro")).toEqual(new Set());
  });
});

describe("two names that disagree", () => {
  /*
   * 534 pairs were waiting in the queue and about half were two different
   * sides. They shared a shape: everything matched but the one word whose
   * whole job is to tell them apart.
   */
  const club = "Eastside FC";
  const side = (name: string) => ({
    id: name,
    slug: name,
    name,
    clubId: "c",
    gender: "boys" as const,
    birthYears: [2014, 2015],
    tier: null,
    events: 1,
    matches: 3,
  });
  const propose = (a: string, b: string) =>
    proposeMatches([side(a), side(b)], new Map([["c", club]]));

  it("does not offer Red beside Grey", () => {
    expect(propose("Eastside FC B14/15 Red", "Eastside FC B14/15 Grey")).toEqual([]);
  });

  it("does not offer one branch beside another", () => {
    // Seattle United's Northwest and its South are two sides, and the only
    // thing that says so is the word they differ by.
    expect(
      propose("Eastside FC Northwest B14/15 Blue", "Eastside FC South B14/15 Blue"),
    ).toEqual([]);
  });

  it("still offers a name beside the same name said more fully", () => {
    // One team written twice, which is what this queue is for.
    expect(propose("Eastside FC B14/15", "Eastside FC B14/15 Red")).toHaveLength(1);
  });

  it("reads a number standing on its own as the squad it is", () => {
    /*
     * "Academy B14/15 2" is that club's second side. Only a hyphenated
     * number counted before, and distinctiveWords drops anything one
     * character long, so the second side and the first read as one team at a
     * hundred per cent — 143 of the 534.
     */
    expect(squadMarks("Eastside FC Academy B14/15 2")).toContain("2");
    expect(propose("Eastside FC Academy B14/15", "Eastside FC Academy B14/15 2")).toEqual([]);
  });

  it("does not read a cohort's digits as a squad", () => {
    expect([...squadMarks("Eastside FC B14/15")]).toEqual([]);
  });
});
