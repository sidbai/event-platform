import { describe, expect, it } from "vitest";

import { marksIn, namedApart, vocabularyOf, type ClubVocabulary } from "./vocabulary";
import { EMPTY_PROFILE, type ClubProfile } from "./profile";

/*
 * These are the real vocabularies of two clubs in the directory, because the
 * cases that matter are the ones their own websites created.
 */
const seattleUnited: ClubVocabulary = {
  levels: ["ECNL", "ECNL RL", "Copa", "Tango", "Samba", "Nova", "Blue", "White", "Black"],
  branches: ["Shoreline", "Northwest", "South"],
};

const eastside: ClubVocabulary = {
  levels: ["ECNL", "Red", "White", "Blue", "Grey", "Navy", "Maroon"],
  branches: ["Preston", "Bellevue", "West", "West Maroon", "West Red"],
};

describe("namedApart", () => {
  it("separates two regions that share a level", () => {
    // The case a single flat word list cannot express: both are Blue.
    expect(
      namedApart(seattleUnited, "Northwest B13 Blue", "South B13 Blue"),
    ).toMatch(/programme/);
  });

  it("separates two levels within one region", () => {
    expect(namedApart(seattleUnited, "B16 Copa", "B16 Tango")).toMatch(/level/);
  });

  it("says nothing when one name is simply the other with more said", () => {
    // "NW United B17/18" beside "NW United B17/18 Red" is one team twice.
    expect(namedApart(eastside, "BU12", "BU12 Red")).toBeNull();
  });

  it("says nothing when they agree on everything they state", () => {
    expect(namedApart(seattleUnited, "Shoreline B15 Blue", "Shoreline B15 Blue")).toBeNull();
  });

  it("is not fooled by a word inside a longer one", () => {
    // Redmond is a town, not the Red team.
    expect(namedApart(eastside, "BU12 Redmond", "BU12 Grey")).toBeNull();
  });

  it("separates two hubs that share a word", () => {
    // West is the hub; the second word is which team. Sharing West is not
    // agreement, which an intersection would have called it.
    expect(namedApart(eastside, "BU12 West Maroon", "BU12 West Red")).toMatch(/level|programme/);
    expect(namedApart(eastside, "BU12 West Maroon", "BU12 West Maroon")).toBeNull();
  });

  it("keeps a pair where one name is the other said more fully", () => {
    expect(namedApart(eastside, "BU12 West", "BU12 West Red")).toBeNull();
  });

  it("ignores a level word that is part of the club's own name", () => {
    const crossfire: ClubVocabulary = { levels: ["ECNL", "Premier", "RCL"], branches: [] };
    // Every Crossfire side is called "Crossfire Premier something".
    expect(
      namedApart(crossfire, "Crossfire Premier B13 ECNL", "Crossfire Premier B13", "Crossfire Premier"),
    ).toBeNull();
    expect(
      namedApart(crossfire, "Crossfire Premier B13 ECNL", "Crossfire Premier B13 RCL", "Crossfire Premier"),
    ).toMatch(/level/);
  });

  it("says nothing for a club we have read nothing about", () => {
    expect(namedApart({ levels: [], branches: [] }, "B13 Red", "B13 Grey")).toBeNull();
  });
});

describe("marksIn", () => {
  it("matches whole words only", () => {
    expect(marksIn("BU12 Redmond Navy", ["Red", "Navy"])).toEqual(new Set(["navy"]));
  });

  it("ignores punctuation and case", () => {
    expect(marksIn("G14 Pre-ECNL II", ["pre ecnl"])).toEqual(new Set(["pre ecnl"]));
  });
});

describe("vocabularyOf", () => {
  const profile: ClubProfile = {
    ...EMPTY_PROFILE,
    slug: "x",
    readAt: "2026-09-11T00:00:00.000Z",
    model: "test",
    tiers: ["ECNL", "Red"],
    squadMarkers: ["Red", "Grey"],
    branches: ["Preston"],
  };

  it("puts levels and branches in separate groups", () => {
    expect(vocabularyOf(profile)).toEqual({
      levels: ["ECNL", "Red", "Grey"],
      branches: ["Preston"],
    });
  });
});
