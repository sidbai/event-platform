import { describe, expect, it } from "vitest";

import {
  chooseSurvivor,
  groupDuplicates,
  nameIsDistinctive,
  normaliseTeamName,
  type MergeCandidate,
} from "./merge-plan";

const team = (over: Partial<MergeCandidate> & { id: string }): MergeCandidate => ({
  slug: over.id,
  name: "XF U12 G14-15 ECNL",
  ownerId: null,
  visibility: "private",
  sourceTeamIds: [],
  matches: 0,
  events: 1,
  ...over,
});

describe("normaliseTeamName", () => {
  it("sees through punctuation and case", () => {
    expect(normaliseTeamName("Crossfire Select B-U10A  Matisz")).toBe(
      normaliseTeamName("crossfire select b u10a matisz"),
    );
  });

  it("does not run two different sides together", () => {
    expect(normaliseTeamName("XF U10 RCL 2")).not.toBe(normaliseTeamName("XF U10 RCL 3"));
  });

  it("keeps names that are not written in Latin letters", () => {
    /*
     * The real one. Stripping to [a-z0-9] deleted every Chinese character, so
     * 烙饼FC, 吃饼FC and 喂饼FC all became "fc" and the merge screen offered to
     * fold three different clubs into one on its very first row.
     */
    expect(normaliseTeamName("烙饼FC")).not.toBe(normaliseTeamName("吃饼FC"));
    expect(normaliseTeamName("喂饼FC")).not.toBe(normaliseTeamName("烙饼FC"));
    // Still sees through the punctuation it is meant to.
    expect(normaliseTeamName("烙饼 FC")).toBe(normaliseTeamName("烙饼FC"));
  });
});

describe("nameIsDistinctive", () => {
  it("refuses to group on a suffix half the region shares", () => {
    expect(nameIsDistinctive(normaliseTeamName("FC"))).toBe(false);
    expect(nameIsDistinctive(normaliseTeamName("B14"))).toBe(false);
    expect(nameIsDistinctive(normaliseTeamName("烙饼FC"))).toBe(true);
    expect(nameIsDistinctive(normaliseTeamName("Seattle Celtic B14"))).toBe(true);
  });
});

describe("chooseSurvivor", () => {
  it("keeps the team somebody owns", () => {
    /*
     * The one that must never go the other way. Folding a claimed team into a
     * shell hands somebody's team to a row nobody owns, and there is no
     * undoing it afterwards.
     */
    const shell = team({ id: "shell", matches: 40 });
    const claimed = team({ id: "claimed", ownerId: "u1", matches: 2 });
    expect(chooseSurvivor([shell, claimed])?.id).toBe("claimed");
  });

  it("then keeps the one holding the most history", () => {
    // Fewest matches to move, fewest links to break.
    expect(
      chooseSurvivor([team({ id: "a", matches: 3 }), team({ id: "b", matches: 9 })])?.id,
    ).toBe("b");
  });

  it("is stable rather than arbitrary when two rows are equal", () => {
    const rows = [team({ id: "b" }), team({ id: "a" })];
    expect(chooseSurvivor(rows)?.id).toBe(chooseSurvivor([...rows].reverse())?.id);
  });
});

describe("groupDuplicates", () => {
  it("trusts the platform's own id over the name", () => {
    // A2E reuses its team id across events. That is the platform saying these
    // are the same side, which beats any comparison of strings.
    const rows = [
      team({ id: "1", sourceTeamIds: ["6172"], name: "XF GU8 RCL3", matches: 4 }),
      team({ id: "2", sourceTeamIds: ["6172"], name: "XF GU8 (18-19) RCL3" }),
    ];
    const [group] = groupDuplicates(rows);
    expect(group.because).toBe("same source id");
    expect(group.survivor.id).toBe("1");
    expect(group.losers.map((l) => l.id)).toEqual(["2"]);
  });

  it("catches a team that re-registered under a new id", () => {
    // The other half of the real data: same name, different id each season.
    const rows = [
      team({ id: "1", sourceTeamIds: ["4195"], matches: 6 }),
      team({ id: "2", sourceTeamIds: ["8541"] }),
    ];
    const [group] = groupDuplicates(rows);
    expect(group.because).toBe("same name");
    expect(group.losers.map((l) => l.id)).toEqual(["2"]);
  });

  it("puts each row in one group only", () => {
    // A row explained by its source id must not be pulled into a name bucket
    // as well, or a merge would be proposed twice and run twice.
    const rows = [
      team({ id: "1", sourceTeamIds: ["6172"] }),
      team({ id: "2", sourceTeamIds: ["6172"] }),
      team({ id: "3", sourceTeamIds: ["9999"] }),
    ];
    const groups = groupDuplicates(rows);
    const seen = groups.flatMap((g) => [g.survivor.id, ...g.losers.map((l) => l.id)]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("does not gather clubs whose names only share a suffix", () => {
    const rows = [
      team({ id: "1", name: "烙饼FC" }),
      team({ id: "2", name: "吃饼FC" }),
      team({ id: "3", name: "喂饼FC" }),
    ];
    expect(groupDuplicates(rows)).toEqual([]);
  });

  it("leaves a team that looks like nobody else alone", () => {
    expect(
      groupDuplicates([team({ id: "1" }), team({ id: "2", name: "Seattle Celtic B14" })]),
    ).toEqual([]);
  });

  it("puts the biggest tangles first, since those are worth a person's time", () => {
    const rows = [
      team({ id: "a1", name: "Alpha" }),
      team({ id: "a2", name: "Alpha" }),
      team({ id: "b1", name: "Bravo" }),
      team({ id: "b2", name: "Bravo" }),
      team({ id: "b3", name: "Bravo" }),
    ];
    expect(groupDuplicates(rows)[0].losers).toHaveLength(2);
  });
});
