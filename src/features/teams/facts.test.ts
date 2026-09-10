import { describe, expect, it } from "vitest";

import { teamFactsFrom } from "./facts";

const SEPT = new Date("2026-09-05T00:00:00Z");

describe("teamFactsFrom", () => {
  it("reads everything a full name states", () => {
    expect(
      teamFactsFrom("XF U17 B09-10 ECNL RL", {
        seasonStart: SEPT,
        clubSlug: "crossfire-premier",
      }),
    ).toEqual({
      birthYears: [2009, 2010],
      gender: "boys",
      tier: "ECNL RL",
      program: null,
    });
  });

  it("derives the cohort from the age group when the name states no years", () => {
    expect(
      teamFactsFrom("NSC BU10D Dragons", {
        seasonStart: SEPT,
        clubSlug: "northshore-select-club",
      }).birthYears,
    ).toEqual([2016, 2017]);
  });

  it("prefers the years a name states over the ones its age group implies", () => {
    // "XF BU8 (18-19)" says both, and the stated pair is the fact.
    expect(
      teamFactsFrom("XF BU8 (18-19) RCL 1, Legg", {
        seasonStart: SEPT,
        clubSlug: "crossfire-premier",
      }).birthYears,
    ).toEqual([2018, 2019]);
  });

  it("refuses to date a team when there is no season to date it against", () => {
    /*
     * An event with no start date cannot say which cohort its U12 is, and a
     * guess here would be written as a fact about children.
     */
    expect(
      teamFactsFrom("NSC BU10D", { seasonStart: null, clubSlug: null }).birthYears,
    ).toEqual([]);
    // A name that states its years needs no season.
    expect(
      teamFactsFrom("BVBIA WA-EASTSIDE-B2013-2014", {
        seasonStart: null,
        clubSlug: null,
      }).birthYears,
    ).toEqual([2013, 2014]);
  });

  it("reads a branch only for the club that has one", () => {
    expect(
      teamFactsFrom("Seattle United NW B14 Black", {
        seasonStart: SEPT,
        clubSlug: "seattle-united",
      }).program,
    ).toBe("Northwest");
    expect(
      teamFactsFrom("NW United BU15 Red", {
        seasonStart: SEPT,
        clubSlug: "northwest-united-fc",
      }).program,
    ).toBeNull();
  });

  it("says nothing it cannot read", () => {
    expect(teamFactsFrom("Allianz Burnaby", { seasonStart: SEPT, clubSlug: null })).toEqual(
      { birthYears: [], gender: null, tier: null, program: null },
    );
  });
});

describe("what the division says", () => {
  it("takes the gender from the flight when the name does not say", () => {
    /*
     * All 227 teams here with no gender were entered in a division that
     * named one. A side in the boys' U15 flight is a boys' U15 side, and no
     * spreadsheet was ever going to beat reading the heading.
     */
    expect(
      teamFactsFrom("Top Ballers", {
        seasonStart: SEPT,
        clubSlug: null,
        division: "Boys U15 Gold",
      }).gender,
    ).toBe("boys");
    expect(
      teamFactsFrom("Lightning", {
        seasonStart: SEPT,
        clubSlug: null,
        division: "Girls-U11 - Silver",
      }).gender,
    ).toBe("girls");
  });

  it("takes the cohort from the flight's age group", () => {
    expect(
      teamFactsFrom("SPFC", {
        seasonStart: SEPT,
        clubSlug: null,
        division: "Boys-U10 - Silver 1",
      }).birthYears,
    ).toEqual([2016, 2017]);
  });

  it("lets the team's own name win", () => {
    // A name is about the team; a division is about the flight it entered.
    // Where they disagree the team is the better authority on itself.
    const facts = teamFactsFrom("XF GU12 White", {
      seasonStart: SEPT,
      clubSlug: null,
      division: "Boys U15 Gold",
    });
    expect(facts.gender).toBe("girls");
    // U12 from its own name, not U15 from the flight it was entered in.
    expect(facts.birthYears).toEqual([2014, 2015]);
  });

  it("reads nothing from a division that names neither", () => {
    const facts = teamFactsFrom("Top Ballers", {
      seasonStart: SEPT,
      clubSlug: null,
      division: "Unassigned",
    });
    expect(facts.gender).toBeNull();
    expect(facts.birthYears).toEqual([]);
  });

  it("is unchanged when no division comes along", () => {
    expect(
      teamFactsFrom("Top Ballers", { seasonStart: SEPT, clubSlug: null }).gender,
    ).toBeNull();
  });
});

describe("a gender the source states outright", () => {
  it("fills in what neither the name nor the division says", () => {
    // Modular11: "Harbor SC" in "U13 EA PACNW", with MALE in its own column.
    expect(
      teamFactsFrom("Harbor SC", {
        seasonStart: new Date("2026-09-01"),
        clubSlug: null,
        division: "U13 EA PACNW",
        gender: "boys",
      }),
    ).toMatchObject({ gender: "boys", birthYears: [2013, 2014] });
  });

  it("never outranks the team's own name, or its flight", () => {
    /*
     * Last of the three on purpose. A column in somebody's export is the
     * weakest of the evidence, and a source that contradicts the name a club
     * chose does not get to win.
     */
    const both = { seasonStart: new Date("2026-09-01"), clubSlug: null, gender: "girls" as const };
    expect(teamFactsFrom("XF B13/14 ECNL", both).gender).toBe("boys");
    expect(teamFactsFrom("Harbor SC", { ...both, division: "Boys U13" }).gender).toBe("boys");
  });
});
