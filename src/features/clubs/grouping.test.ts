import { describe, expect, it } from "vitest";

import { groupUnplaced } from "./grouping";

const team = (name: string) => ({ id: name, name });

describe("groupUnplaced", () => {
  it("gathers the names that begin the same way", () => {
    const { groups } = groupUnplaced(
      ["MRFC B09/10 Academy 2", "MRFC B16/15 RED", "MRFC GU14"].map(team),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("mrfc");
    expect(groups[0].teams).toHaveLength(3);
  });

  it("takes every word the group agrees on, not just the first", () => {
    // Filing these should teach the matcher "spartatacoma", not "sparta".
    const { groups } = groupUnplaced(
      [
        "Sparta Tacoma - B14/15 Red EA",
        "Sparta Tacoma - B14/15 White",
        "Sparta Tacoma - GU12 Red",
      ].map(team),
    );
    expect(groups[0].key).toBe("spartatacoma");
    expect(groups[0].label).toBe("Sparta Tacoma");
  });

  it("takes apart a prefix that turns out to be two clubs", () => {
    // Both begin "Oregon", and filing them together would put one club's
    // teams on the other's page.
    const { groups } = groupUnplaced(
      [
        "Oregon Surf PreMLS Next B2015/2016",
        "Oregon Surf ECNL G2011/12",
        "Oregon Surf BU14",
        "Oregon Premier FC Pre ECNL G2016/17",
        "Oregon Premier FC ECNL B2012/13",
        "Oregon Premier FC GU11",
      ].map(team),
    );
    expect(groups.map((g) => g.key).sort()).toEqual(["oregonpremierfc", "oregonsurf"]);
  });

  it("does not put two clubs together because both are an FC", () => {
    // Grouping on "fc" alone would file FC Portland under FC Edmonds.
    const { groups } = groupUnplaced(
      [
        "FC Portland Pre-ECNL B2014/15 I",
        "FC Portland ECNL B2012/13",
        "FC Portland ECNL G2011/12",
        "FC Edmonds Chaos",
        "FC Edmonds B12 Blue",
        "FC Edmonds G14",
      ].map(team),
    );
    expect(groups.map((g) => g.key).sort()).toEqual(["fcedmonds", "fcportland"]);
  });

  it("keeps the capitals a name was given, for reading", () => {
    const { groups } = groupUnplaced(
      ["Chuckanut Tide FC BU12 Purple", "Chuckanut Tide FC GU11 Purple", "Chuckanut Tide GU9"].map(team),
    );
    expect(groups[0].label).toBe("Chuckanut Tide");
    expect(groups[0].key).toBe("chuckanuttide");
  });

  it("keeps a group whose names differ only in their age group", () => {
    // MRFC teams disagree at the second word too, but no two of them agree
    // with each other there — that is squad numbering, not a second club.
    const { groups } = groupUnplaced(
      ["MRFC B09/10 Academy", "MRFC B16/15 RED", "MRFC GU14 Navy"].map(team),
    );
    expect(groups.map((g) => g.key)).toEqual(["mrfc"]);
  });

  it("does not let a name that repeats itself make an alias nothing matches", () => {
    // "Capital FC - Capital FC G15 Pre-ECNL 1", as the platform exports it.
    const { groups } = groupUnplaced(
      [
        "Capital FC - Capital FC G15 Pre-ECNL 1",
        "Capital FC - Capital FC G14 Pre-ECNL 1",
        "Capital FC - Capital FC B12 Red",
      ].map(team),
    );
    expect(groups[0].key).toBe("capitalfc");
  });

  it("stops at four words, where the age group starts", () => {
    const { groups } = groupUnplaced(
      [
        "Central Washington Sounders CWS GU11 Pre-ECNL",
        "Central Washington Sounders CWS GU12 Pre-ECNL",
        "Central Washington Sounders CWS BU11 Navy",
      ].map(team),
    );
    expect(groups[0].key).toBe("centralwashingtonsounderscws");
  });

  it("leaves the strays in the tail rather than making a heading of one", () => {
    const { groups, rest } = groupUnplaced(
      ["Olympus 2015", "Olympus 2010", "Olympus 2009", "Falcons", "Blazers"].map(team),
    );
    expect(groups).toHaveLength(1);
    expect(rest.map((t) => t.name)).toEqual(["Blazers", "Falcons"]);
  });

  it("biggest group first, because that is the decision worth making", () => {
    const many = ["Sparta Tacoma A", "Sparta Tacoma B", "Sparta Tacoma C", "Sparta Tacoma D"];
    const few = ["Gala FC U11", "Gala FC U12", "Gala u13 girls"];
    const { groups } = groupUnplaced([...few, ...many].map(team));
    expect(groups.map((g) => g.teams.length)).toEqual([4, 3]);
  });
});
