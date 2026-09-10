import { describe, expect, it } from "vitest";

import { byRelevance, escapeLike, prefixRank, searchTerms } from "./terms";

describe("searchTerms", () => {
  it("asks for every word separately, so they need not be adjacent", () => {
    // The team is "Crossfire Premier B13/14 ECNL 2"; those two words are four
    // words apart, and as one phrase they matched nothing.
    expect(searchTerms("crossfire ecnl")).toEqual(["%crossfire%", "%ecnl%"]);
  });

  it("is no filter at all when there is nothing to search for", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });

  it("keeps a search for a wildcard from matching everything", () => {
    expect(searchTerms("50%")).toEqual(["%50\\%%"]);
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("stops before a paste turns into a query per word", () => {
    const long = "a b c d e f g h i j";
    expect(searchTerms(long)).toHaveLength(6);
  });
});

describe("prefixRank", () => {
  it("puts what the name begins with first", () => {
    expect(prefixRank("Crossfire Premier B14", "cross")).toBe(0);
    expect(prefixRank("Northcross United", "cross")).toBe(2);
  });

  it("counts the start of any word, not just the first", () => {
    expect(prefixRank("Western Washington Surf BU12", "surf")).toBe(1);
  });

  it("does not care about case", () => {
    expect(prefixRank("WW SURF BU11", "surf")).toBe(1);
    expect(prefixRank("Seattle Celtic", "SEATTLE")).toBe(0);
  });

  it("treats a term of punctuation as no term rather than a pattern", () => {
    expect(prefixRank("Anything", "(")).toBe(2);
    expect(prefixRank("Anything", "  ")).toBe(2);
  });
});

describe("byRelevance", () => {
  it("offers the club before the ones that merely contain it", () => {
    const rows = [
      { label: "Northcross United B12" },
      { label: "WW Surf Crossfire Cup" },
      { label: "Crossfire Premier B14/15 ECNL" },
    ];
    expect(byRelevance(rows, "cross").map((r) => r.label)).toEqual([
      "Crossfire Premier B14/15 ECNL",
      "WW Surf Crossfire Cup",
      "Northcross United B12",
    ]);
  });

  it("leaves the order the query gave it where nothing separates two rows", () => {
    const rows = [{ label: "Surf B12" }, { label: "Surf B13" }];
    expect(byRelevance(rows, "surf").map((r) => r.label)).toEqual([
      "Surf B12",
      "Surf B13",
    ]);
  });
});
