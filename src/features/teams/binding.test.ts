import { describe, expect, it } from "vitest";

import {
  agreement,
  canBind,
  contradiction,
  teamToBindTo,
  type BindCandidate,
} from "./binding";

let n = 0;
const team = (over: Partial<BindCandidate> & { name: string }): BindCandidate => {
  n += 1;
  return {
    id: `t${n}`,
    clubId: "crossfire",
    gender: "boys",
    birthYears: [2013, 2014],
    tier: null,
    ...over,
  };
};

describe("teamToBindTo", () => {
  it("attaches an imported name to the team already here", () => {
    /*
     * 177 of the 191 pairs in the queue were this: a tournament importing a
     * side that already existed, and somebody asked to put back together
     * what the import had just split.
     */
    const incoming = team({ name: "Eagleclaw FC BU14" });
    const existing = team({ name: "Eagleclaw FC BU14" });
    expect(teamToBindTo(incoming, [existing])?.id).toBe(existing.id);
  });

  it("ignores punctuation and case, as the duplicate finder does", () => {
    expect(
      teamToBindTo(team({ name: "eastside fc - bu9 - maroon" }), [
        team({ name: "Eastside FC, BU9, Maroon" }),
      ]),
    ).not.toBeNull();
  });

  it("refuses when nothing but the name agrees", () => {
    /*
     * The case binding must not take. Two clubs in one region both fielding
     * a "Warriors", neither filed, neither dated: the name is all there is,
     * and this happens without anyone looking.
     */
    const bare = { clubId: null, gender: null, birthYears: [], tier: null };
    expect(
      teamToBindTo(team({ name: "Warriors", ...bare }), [
        team({ name: "Warriors", ...bare }),
      ]),
    ).toBeNull();
  });

  it("refuses when a fact contradicts, however well the name matches", () => {
    for (const different of [
      { clubId: "seattle-united" },
      { gender: "girls" },
      { tier: "ECNL RL" },
      { birthYears: [2016, 2017] },
    ]) {
      const incoming = team({ name: "XF White Sharks", tier: "RCL 1" });
      const other = team({ name: "XF White Sharks", tier: "RCL 1", ...different });
      expect(teamToBindTo(incoming, [other])).toBeNull();
    }
  });

  it("binds when one team qualifies under several of its names", () => {
    /*
     * A team is offered under its own name and under every name an event has
     * published for it, so it can qualify more than once. Counting rows
     * rather than teams would refuse the case this exists for.
     */
    const existing = team({ name: "XF BU13" });
    const alsoKnownAs = { ...existing, name: "Crossfire Select B13-14" };
    expect(
      teamToBindTo(team({ name: "Crossfire Select B13-14" }), [existing, alsoKnownAs])?.id,
    ).toBe(existing.id);
  });

  it("refuses to choose between two teams that both qualify", () => {
    // Nobody can say which, and a new row plus a queue entry is honest.
    const incoming = team({ name: "XF Blue Jays" });
    expect(
      teamToBindTo(incoming, [team({ name: "XF Blue Jays" }), team({ name: "XF Blue Jays" })]),
    ).toBeNull();
  });

  it("never binds a team to itself", () => {
    const self = team({ name: "XF Blue Jays" });
    expect(teamToBindTo(self, [self])).toBeNull();
  });

  it("has nothing to bind a nameless row to", () => {
    expect(teamToBindTo(team({ name: "…" }), [team({ name: "…" })])).toBeNull();
  });
});

describe("contradiction", () => {
  it("treats an unknown as no obstacle, not as a difference", () => {
    // A team imported before the facts were read has none of them, and
    // blocking on that would keep every one of them out.
    const known = team({ name: "x", tier: "RCL 1" });
    const unknown = team({ name: "x", clubId: null, gender: null, birthYears: [], tier: null });
    expect(contradiction(known, unknown)).toBeNull();
  });

  it("names what it found, since each is a different mistake", () => {
    expect(
      contradiction(team({ name: "x" }), team({ name: "x", gender: "girls" })),
    ).toBe("different genders");
  });
});

describe("agreement", () => {
  it("wants a fact, not the absence of one", () => {
    const bare = { clubId: null, gender: null, birthYears: [], tier: null };
    expect(agreement(team({ name: "x", ...bare }), team({ name: "x", ...bare }))).toBe(false);
    expect(agreement(team({ name: "x" }), team({ name: "x" }))).toBe(true);
  });
});

describe("canBind", () => {
  it("is the rule both the import and the backlog use", () => {
    // Exported so clearing what past imports left cannot drift from what
    // future imports do.
    expect(canBind(team({ name: "Eagleclaw FC BU14" }), team({ name: "Eagleclaw FC BU14" }))).toBe(true);
    expect(
      canBind(
        team({ name: "Eagleclaw FC BU14" }),
        team({ name: "Eagleclaw FC BU14", gender: "girls" }),
      ),
    ).toBe(false);
  });
});

describe("adjacent age groups", () => {
  let seq = 0;
  const side = (years: number[]) => ({
    id: `t${seq++}`,
    name: "Emerald City FC",
    clubId: "emerald",
    gender: "boys",
    birthYears: years,
    tier: null,
  });

  it("does not bind a club's U13 side to its U14 side", () => {
    /*
     * Every two-year band overlaps the one above it by exactly a year, so
     * "shares a year" was true of every pair of adjacent age groups a club
     * fields. Binding them made one team of two, and since a team may hold
     * only one entry per event the second was dropped on the way in — 344
     * Elite Academy fixtures filed under an age group whose teams were in
     * another one.
     */
    expect(canBind(side([2013, 2014]), side([2012, 2013]))).toBe(false);
    expect(contradiction(side([2013, 2014]), side([2012, 2013]))).toBe(
      "different birth years",
    );
  });

  it("still binds the same band to itself", () => {
    expect(canBind(side([2013, 2014]), side([2013, 2014]))).toBe(true);
  });

  it("binds a single-year side to the band that contains it", () => {
    // "Seattle Celtic B14" against a U12 band is a team within that age
    // group, not a different one — a club that names one year still means it.
    expect(canBind(side([2014]), side([2014, 2015]))).toBe(true);
    expect(canBind(side([2014, 2015]), side([2014]))).toBe(true);
  });

  it("does not bind a single year to a band that does not contain it", () => {
    expect(canBind(side([2016]), side([2014, 2015]))).toBe(false);
  });
});
