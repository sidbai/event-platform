import { describe, expect, it } from "vitest";

import { parseProgram, parseTier } from "./naming";

describe("parseTier", () => {
  it("reads the tiers the imports use", () => {
    expect(parseTier("XF B09/10 ECNL 1")).toBe("ECNL 1");
    expect(parseTier("XF U17 B09-10 ECNL RL")).toBe("ECNL RL");
    expect(parseTier("WW SURF BU19 ACADEMY MLS NEXT")).toBe("MLS Next");
    // "Gold MLS" is a Gold side, not the MLS Next league — a bare "MLS" is
    // not enough to claim the national one.
    expect(parseTier("Sozo FC Boys U13 Gold MLS, Cuevas")).toBe("Gold");
    expect(parseTier("XF, U14, B12 - 13, RCL 1, Plackov")).toBe("RCL 1");
    expect(parseTier("Wenatchee FA N1 B12/13 Red")).toBe("National 1");
  });

  it("prefers the longer tier when one contains another", () => {
    /*
     * ECNL RL is a different league from ECNL, and Pre-MLS Next is not MLS
     * Next. Read shortest-first they all collapse into the top tier, which
     * would put a regional side in the national table.
     */
    expect(parseTier("XF ECNL-RL B2011/2012")).toBe("ECNL RL");
    expect(parseTier("Atletico BU12 Pre MLS Next ORO")).toBe("Pre-MLS Next");
    expect(parseTier("XF BU11 2015-16 ECNL2")).toBe("ECNL 2");
  });

  it("normalises spelling, so a directory can group by it", () => {
    // "RCL1", "RCL 1" and "rcl 1" are one tier written three ways.
    expect(parseTier("Team RCL1")).toBe("RCL 1");
    expect(parseTier("Team rcl 1")).toBe("RCL 1");
    expect(parseTier("Team ECRL")).toBe("ECNL RL");
    // Oro is Gold in the same club's other teams.
    expect(parseTier("Atletico BU10 Oro")).toBe("Gold");
  });

  it("reads the organizers' own misspelling of ECNL", () => {
    // "ENCL" appears on four teams in production. Refusing it leaves real
    // sides with no tier for a typo they did not make on our side.
    expect(parseTier("Crossfire G2012/13 ENCL RL")).toBe("ECNL RL");
    expect(parseTier("Team ENCL 1")).toBe("ECNL 1");
  });

  it("says nothing for a name that states no tier", () => {
    // 299 of 617 club teams. Silence is the honest answer for them.
    expect(parseTier("NSC BU10D Dragons")).toBeNull();
    expect(parseTier("Crossfire Select BU19 B")).toBeNull();
  });
});

describe("parseProgram", () => {
  it("reads a club's own stream", () => {
    expect(parseProgram("Crossfire Select BU19 B", "crossfire-premier")).toBe("Select");
    expect(parseProgram("WW SURF BU19 ACADEMY MLS NEXT", "western-washington-surf")).toBe(
      "Academy",
    );
    expect(parseProgram("Valor Premier Gold, Mungai", "valor-soccer")).toBe("Premier");
  });

  it("reads a branch only inside the club that has one", () => {
    /*
     * The trap: "NW" is Seattle United's Northwest branch and also the whole
     * of NW United, a different club; "South" starts South Kitsap Soccer
     * Club. Read from the name alone, both clubs become Seattle United
     * branches.
     */
    expect(parseProgram("Seattle United NW B14 Black", "seattle-united")).toBe(
      "Northwest",
    );
    expect(parseProgram("Seattle United - South B15 Blue", "seattle-united")).toBe(
      "South",
    );
    expect(parseProgram("Seattle United B13 White Shoreline", "seattle-united")).toBe(
      "Shoreline",
    );

    expect(parseProgram("NW United BU15 Red Quevedo", "northwest-united-fc")).toBeNull();
    expect(parseProgram("South Kitsap United BU11", "south-kitsap-soccer-club")).toBeNull();
  });

  it("lets a branch outrank a generic word", () => {
    // Shoreline is what tells this team from the club's other sides; every
    // one of them could be called premier.
    expect(
      parseProgram("Seattle United Shoreline Premier B12", "seattle-united"),
    ).toBe("Shoreline");
  });

  it("says nothing for a team with no stream named", () => {
    expect(parseProgram("XF B09/10 ECNL 1", "crossfire-premier")).toBeNull();
    expect(parseProgram("NSC BU10D Dragons", "northshore-select-club")).toBeNull();
  });

  it("reads nothing from a club it has no branches for", () => {
    expect(parseProgram("Some Team NW Blue", null)).toBeNull();
  });
});
