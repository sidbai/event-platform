import { describe, expect, it } from "vitest";

import { aliasKey, candidateKeys, clubIndex, matchClub, words } from "./matching";

/** The directory as it actually is, for the cases that come from real data. */
const CLUBS = [
  { id: "crossfire", name: "Crossfire Premier" },
  { id: "seattle-united", name: "Seattle United" },
  { id: "seattle-celtic", name: "Seattle Celtic" },
  { id: "united-sports", name: "United Sports FC" },
  { id: "north-kitsap", name: "North Kitsap Soccer Club" },
  { id: "northlake", name: "Northlake Soccer Club" },
  { id: "valor", name: "Valor Soccer" },
  { id: "wa-surf", name: "Western Washington Surf" },
];

const index = clubIndex(CLUBS);
const NO_ALIASES = new Map<string, string>();
const match = (name: string, aliases = NO_ALIASES) =>
  matchClub(name, aliases, index);

describe("words", () => {
  it("keeps letters outside ASCII", () => {
    // The duplicate finder had this bug: 烙饼FC and 吃饼FC both normalised to
    // "fc" and were offered as the same club.
    expect(words("烙饼FC")).toEqual(["烙饼fc"]);
    expect(aliasKey("烙饼 FC")).toBe("烙饼fc");
  });

  it("throws away the punctuation a platform sprinkles in", () => {
    expect(words("XF, U14, B12 - 13, RCL 1")).toEqual([
      "xf", "u14", "b12", "13", "rcl", "1",
    ]);
  });
});

describe("candidateKeys", () => {
  it("offers the longest prefix first, so an affiliate outranks its parent", () => {
    expect(candidateKeys("Seattle United - South B15 Blue")).toEqual([
      "seattleunitedsouthb15",
      "seattleunitedsouth",
      "seattleunited",
      "seattle",
    ]);
  });

  it("stops before the age group and the coach", () => {
    expect(candidateKeys("Crossfire Select B-U10C Quadracci")).not.toContain(
      "crossfireselectbu10cquadracci",
    );
  });
});

describe("clubIndex", () => {
  it("will not answer to a word two clubs share", () => {
    // "north" leads both North Kitsap and Northlake. Guessing between them is
    // worse than asking.
    expect(index.has("north")).toBe(false);
  });

  it("will not answer to a word that describes half the directory", () => {
    expect(index.has("seattle")).toBe(false);
    expect(index.has("united")).toBe(false);
    expect(index.has("washington")).toBe(false);
  });

  it("keeps a club's own full name, generic words and all", () => {
    expect(index.get("seattleunited")).toBe("seattle-united");
    expect(index.get("unitedsportsfc")).toBe("united-sports");
  });

  it("keeps a distinctive leading word", () => {
    // "Valor Soccer" in the directory, "Valor B14 Red" in a schedule.
    expect(index.get("valor")).toBe("valor");
  });
});

describe("matchClub", () => {
  it("matches a team named the way the directory names its club", () => {
    expect(match("Seattle Celtic B14 Premier")?.clubId).toBe("seattle-celtic");
  });

  it("matches an affiliate to the club it belongs to", () => {
    expect(match("Seattle United - South B15 Blue")?.clubId).toBe("seattle-united");
    expect(match("Seattle United NW G12")?.clubId).toBe("seattle-united");
  });

  it("does not confuse two clubs that share a first word", () => {
    expect(match("United PDX BU13")).toBeNull();
    expect(match("North Sound BU12")).toBeNull();
  });

  it("follows an alias somebody approved", () => {
    /*
     * The owner's rule: anything Crossfire is XF, and both are Crossfire
     * Premier. Neither string reaches the club any other way — the directory
     * spells it "Crossfire Premier", and no team is named that.
     */
    const aliases = new Map([
      ["xf", "crossfire"],
      ["crossfire", "crossfire"],
    ]);
    expect(match("XF, U14, B12 - 13, RCL 1, Plackov", aliases)?.clubId).toBe(
      "crossfire",
    );
    expect(match("Crossfire Select B-U10C Quadracci", aliases)?.because).toBe(
      "alias",
    );
  });

  it("will not let a short alias swallow a club it does not name", () => {
    /*
     * "SU B16 South White" is Seattle United, so "su" is a fair alias — but
     * matched as a prefix of the string rather than a whole word it also
     * takes Surf Hawaii and Surf Select. Whole words only.
     */
    const aliases = new Map([["su", "seattle-united"]]);
    expect(match("SU B16 South White, Hassan", aliases)?.clubId).toBe(
      "seattle-united",
    );
    expect(match("Surf Hawaii 12B Academy I", aliases)).toBeNull();
    expect(match("Surf Select G2009", aliases)).toBeNull();
  });

  it("prefers an alias over a name it happens to resemble", () => {
    // A person's decision outranks this file's arithmetic, always.
    const aliases = new Map([["seattleunited", "seattle-celtic"]]);
    expect(match("Seattle United B13 White", aliases)?.clubId).toBe("seattle-celtic");
  });

  it("says nothing rather than something wrong", () => {
    expect(match("Wenatchee FA N1 B12/13 Red")).toBeNull();
    expect(match("2015 Spuraways")).toBeNull();
    expect(match("")).toBeNull();
  });
});
