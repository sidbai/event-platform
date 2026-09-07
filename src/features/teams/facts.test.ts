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
