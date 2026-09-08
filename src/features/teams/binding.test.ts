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
