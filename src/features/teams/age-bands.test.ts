import { describe, expect, it } from "vitest";

import { bandPairs, isBandOf, type BandTeam, type ClubName } from "./age-bands";

const club: ClubName = {
  slug: "eastside-fc",
  name: "Eastside FC",
  shortName: null,
  aliases: [],
};
const clubs = new Map([["c", club]]);

let n = 0;
const team = (name: string, birthYears: number[], over: Partial<BandTeam> = {}): BandTeam => ({
  id: `t${n++}`,
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  clubId: "c",
  birthYears,
  gender: "boys",
  tier: null,
  program: null,
  matches: 0,
  events: 0,
  ...over,
});

describe("isBandOf", () => {
  it("is the band that starts with that year", () => {
    expect(isBandOf(team("x", [2014]), team("y", [2014, 2015]))).toBe(true);
  });

  it("is not the band that ends with it", () => {
    // B14 belongs to B14/15, not to B13/14. The change moved sides down a
    // year, and offering the other one would move them the wrong way.
    expect(isBandOf(team("x", [2014]), team("y", [2013, 2014]))).toBe(false);
  });
});

describe("bandPairs", () => {
  it("folds the single year into the band, never the other way", () => {
    const single = team("Eastside FC B12 ECNL RL", [2012], { tier: "ECNL RL" });
    const band = team("Eastside FC B12/13 ECNL RL", [2012, 2013], { tier: "ECNL RL" });

    expect(bandPairs([single, band], clubs)).toEqual([{ single, band }]);
  });

  it("will not put two sides together because their columns agree", () => {
    /*
     * "Atletico B15 Pre-MLS Next Azul" and "B15/16 Pre-MLS Next Oro" agree on
     * club, gender, tier and programme, and one cohort is inside the other.
     * They are two different sides, and what says so is the word the club
     * uses to tell them apart.
     */
    const azul = team("Eastside FC B15 Azul", [2015]);
    const oro = team("Eastside FC B15/16 Oro", [2015, 2016]);

    expect(bandPairs([azul, oro], clubs)).toEqual([]);
  });

  it("offers nothing when two bands fit equally", () => {
    // Picking either is how a team ends up merged into its club's other side.
    const single = team("Eastside FC B11 Red", [2011]);
    const one = team("Eastside FC B11/12 Red", [2011, 2012]);
    const two = team("Eastside FC B11/12 Red", [2011, 2012]);

    expect(bandPairs([single, one, two], clubs)).toEqual([]);
  });

  it("keeps clubs apart", () => {
    const ours = team("Eastside FC B12", [2012]);
    const theirs = team("Eastside FC B12/13", [2012, 2013], { clubId: "other" });

    expect(bandPairs([ours, theirs], clubs)).toEqual([]);
  });

  it("keeps genders and tiers apart", () => {
    const boys = team("Eastside FC B12", [2012]);
    const girls = team("Eastside FC G12/13", [2012, 2013], { gender: "girls" });
    expect(bandPairs([boys, girls], clubs)).toEqual([]);

    const rl = team("Eastside FC B12 ECNL RL", [2012], { tier: "ECNL RL" });
    const ecnl = team("Eastside FC B12/13 ECNL", [2012, 2013], { tier: "ECNL" });
    expect(bandPairs([rl, ecnl], clubs)).toEqual([]);
  });

  it("says nothing about a team with no club", () => {
    // Nothing to compare the rest of the name against.
    const single = team("Someone B12", [2012], { clubId: null });
    const band = team("Someone B12/13", [2012, 2013], { clubId: null });
    expect(bandPairs([single, band], clubs)).toEqual([]);
  });
});
