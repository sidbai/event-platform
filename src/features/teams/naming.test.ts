import { describe, expect, it } from "vitest";

import { fullerTier, parseProgram, parseTier } from "./naming";

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
  });

  it("leaves a club's own word for a side alone, even in another language", () => {
    /*
     * "Oro" was read as the tier Gold on the premise that it meant the same
     * thing at the same club. Atletico Futbol Club says otherwise: it names
     * its sides Azul, Rojo and Oro and prints the tier separately — "Atletico
     * Futbol Club B07/08 MLS Next Oro". Three of the four kept the club's
     * word and the fourth had it translated.
     */
    expect(parseTier("Atletico BU10 Oro")).toBeNull();
    expect(parseTier("Atletico BU9 Pre MLS Next Oro")).toBe("Pre-MLS Next");
    // A club that does mean the tier writes it in English, and still gets it.
    expect(parseTier("Team BU12 Gold")).toBe("Gold");
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

describe("the tiers a club actually names", () => {
  it("keeps MLS Next's sub-tiers apart", () => {
    // Six Seattle Celtic sides read as their own club's first team while
    // "II" was being dropped.
    expect(parseTier("Seattle Celtic B08 MLS Next II")).toBe("MLS Next 2");
    expect(parseTier("Seattle Celtic B09 MLS Next 2")).toBe("MLS Next 2");
    expect(parseTier("Atletico B10/11 MLS Next AD")).toBe("MLS Next AD");
    expect(parseTier("Seattle Celtic B08 MLS Next")).toBe("MLS Next");
    expect(parseTier("Sozo B12 Pre MLS")).toBe("Pre-MLS Next");
  });

  it("reads GA, GA Aspire and Pre-GA as the three tiers they are", () => {
    // Reign Academy fields a GU13 Aspire and a GU13 GA; folding them put two
    // sides a division apart under one label.
    expect(parseTier("Seattle Celtic G13 GA Aspire")).toBe("GA Aspire");
    expect(parseTier("Seattle Celtic G15 Pre-GA Aspire")).toBe("Pre-GA");
    expect(parseTier("Reign Academy GU13 Aspire")).toBe("Aspire");
    expect(parseTier("Reign Academy GU13 GA")).toBe("GA");
    expect(parseTier("Spokane Shadow GU12 Pre GA")).toBe("Pre-GA");
  });

  it("reads Pre-ECNL's divisions, in either spelling", () => {
    // Eastside fields a G14/15 Pre-ECNL 1 and a Pre-ECNL 2; read as plain
    // "Pre-ECNL" they are one side entered twice.
    expect(parseTier("Eastside FC G14/15 Pre-ECNL 1")).toBe("Pre-ECNL 1");
    expect(parseTier("Eastside FC G14/15 Pre-ECNL 2")).toBe("Pre-ECNL 2");
    expect(parseTier("Eastside FC G15/16 Pre-ECNL II")).toBe("Pre-ECNL 2");
    expect(parseTier("Eastside FC B15/16 Pre-ECNL")).toBe("Pre-ECNL");
    // Still a division of its own, not Pre-ECNL with an R on the end.
    expect(parseTier("Oregon Surf PreECNL RL G2014/15")).toBe("Pre-ECNL RL");
  });

  it("keeps Pre-MLS Next and Pre-GA as the tiers they are", () => {
    expect(parseTier("Seattle Celtic B14 Pre-MLS Next")).toBe("Pre-MLS Next");
    expect(parseTier("Atletico B15 Pre-MLS Next Azul")).toBe("Pre-MLS Next");
    expect(parseTier("Seattle Celtic G09 Pre-GA")).toBe("Pre-GA");
  });

  it("reads a club's own name for a side", () => {
    expect(parseTier("Seattle United B16 Nova")).toBe("Nova");
    expect(parseTier("Eastside FC B15/16 Grey")).toBe("Grey");
    expect(parseTier("PacNW B13/14 Maroon")).toBe("Maroon");
  });
});

describe("fullerTier", () => {
  it("takes the more precise reading of one tier", () => {
    expect(fullerTier("MLS Next", "MLS Next 2")).toBe("MLS Next 2");
    expect(fullerTier("RCL", "RCL 1")).toBe("RCL 1");
  });

  it("keeps a column that disagrees outright — somebody may have set it", () => {
    expect(fullerTier("ECNL 1", "RCL 2")).toBe("ECNL 1");
  });

  it("falls back to whichever one exists", () => {
    expect(fullerTier(null, "GA")).toBe("GA");
    expect(fullerTier("GA", null)).toBe("GA");
    expect(fullerTier(null, null)).toBeNull();
  });
});
