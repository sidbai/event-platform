import { describe, expect, it } from "vitest";

import { pairOf, proposeMatches, squadMarks, type MatchCandidate, whyNot } from "./match-plan";

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

describe("pairs the fixture list rules out", () => {
  it("drops a pair that has played itself", () => {
    const a = team({ name: "Crossfire Premier B13/14" });
    const b = team({ name: "Crossfire Premier B13/14 Red" });
    // Without the fixture fact, this is exactly the pair we want offered.
    expect(proposeMatches([a, b], CLUBS)).toHaveLength(1);
    expect(proposeMatches([a, b], CLUBS, new Set([pairOf(a.id, b.id)]))).toEqual([]);
  });

  it("does not care which way round the ids were keyed", () => {
    const a = team({ name: "Crossfire Premier G11" });
    const b = team({ name: "Crossfire Premier G11 Blue" });
    expect(proposeMatches([a, b], CLUBS, new Set([pairOf(b.id, a.id)]))).toEqual([]);
  });

  it("leaves every other pair alone", () => {
    const a = team({ name: "Crossfire Premier B16" });
    const b = team({ name: "Crossfire Premier B16 White" });
    const c = team({ name: "Crossfire Premier B15" , birthYears: [2015] });
    expect(proposeMatches([a, b, c], CLUBS, new Set(["someone:else"]))).toHaveLength(1);
  });
});

describe("pairOf", () => {
  it("is the same key from either side", () => {
    expect(pairOf("b", "a")).toBe(pairOf("a", "b"));
  });
});

describe("what the club says about its own names", () => {
  /*
   * Real rows against the real knowledge base, and the point of each case is
   * that the pair is still *returned*. A rule built from a file somebody
   * wrote by reading a website must not be able to empty a queue on its own.
   *
   * Every case here turns on a word `distinctiveWords` throws away as
   * generic — Premier, Select, Academy. That is not a coincidence and it is
   * where this rule earns its keep: a pair separated by a distinctive word
   * (Red beside Grey) never reaches here, because two names that each carry a
   * word the other lacks are already refused. A pair separated only by
   * "Premier" against "Select" looks, to every general rule, like one name
   * with more said — and only the club knows those are two programmes.
   */
  const pair = (clubSlug: string, clubName: string, a: string, b: string) =>
    proposeMatches(
      [team({ name: a, clubSlug, clubId: "c" }), team({ name: b, clubSlug, clubId: "c" })],
      new Map([["c", clubName]]),
    );

  it("marks Valor's Premier apart from its Select, and still returns it", () => {
    // One of the seven this actually caught in production.
    const [p] = pair(
      "valor-soccer",
      "Valor Soccer",
      "Valor Soccer Premier G16/17 Gold",
      "Valor Soccer Select G16/17",
    );
    expect(p).toBeDefined();
    expect(p.separatedBy).toMatch(/level/);
  });

  it("marks Rush's MLS Next apart from its Select", () => {
    const [p] = pair(
      "washington-rush",
      "Washington Rush",
      "Washington Rush B12/13 MLS Next",
      "Washington Rush Select B12/13",
    );
    expect(p.separatedBy).toMatch(/level/);
  });

  it("leaves a pair unmarked where one name simply says more", () => {
    const [p] = pair("valor-soccer", "Valor Soccer", "Valor Soccer B12", "Valor Soccer Premier B12");
    expect(p).toBeDefined();
    expect(p.separatedBy).toBeUndefined();
  });

  it("marks nothing for a club nothing has been read about", () => {
    const [p] = pair(
      "some-club-we-never-read",
      "Some Club",
      "Some Club Premier B12",
      "Some Club Select B12",
    );
    expect(p).toBeDefined();
    expect(p.separatedBy).toBeUndefined();
  });
});
