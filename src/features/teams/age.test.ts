import { describe, expect, it } from "vitest";

import {
  ageGroupOf,
  birthYearsForAgeGroup,
  formatBirthYears,
  parseAgeGroupFilter,
  parseAgeGroup,
  parseBirthYears,
  parseBirthYearsInput,
  parseGender,
  seasonYearOf,
} from "./age";

describe("parseBirthYears", () => {
  it("reads every notation the imports actually use", () => {
    // All five appear in the same directory today.
    expect(parseBirthYears("Crossfire Select U13 B13-14 C")).toEqual([2013, 2014]);
    expect(parseBirthYears("Eastside FC 2017/18 Gray team")).toEqual([2017, 2018]);
    expect(parseBirthYears("BVBIA WA-EASTSIDE-B2013-2014")).toEqual([2013, 2014]);
    expect(parseBirthYears("XF BU8 (18-19) RCL 1, Legg")).toEqual([2018, 2019]);
    expect(parseBirthYears("2015 Spuraways")).toEqual([2015]);
    expect(parseBirthYears("90+ B2013 Hutchison")).toEqual([2013]);
    expect(parseBirthYears("XF B09/10 ECNL 1")).toEqual([2009, 2010]);
  });

  it("reads a pair written oldest-last", () => {
    /*
     * Three teams in production write it this way — "Olympus 2010/09",
     * "MRFC B16/15 RED", "BVBIA WA-EASTSIDE-G2015-2014" — and read strictly
     * ascending they fell through to the single-year rule and lost a year.
     */
    expect(parseBirthYears("Olympus 2010/09")).toEqual([2009, 2010]);
    expect(parseBirthYears("MRFC B16/15 RED")).toEqual([2015, 2016]);
    expect(parseBirthYears("BVBIA WA-EASTSIDE-G2015-2014")).toEqual([2014, 2015]);
  });

  it("refuses a pair that is not two consecutive years", () => {
    /*
     * "U18/19" is an age range and "RCL 1/2" is a tier. Both look like a
     * cohort to a loose parser, and a wrong birth year is worse than none —
     * it is a fact about children that somebody would rely on.
     */
    expect(parseBirthYears("Boise Timbers U18/19, Basquill")).toEqual([]);
    expect(parseBirthYears("XF, U14, RCL 1/3, Plackov")).toEqual([]);
  });

  it("never guesses from a U-number", () => {
    /*
     * U13 means one cohort in an autumn league and another in a June
     * tournament, because organizers disagree about which season a summer
     * fixture belongs to. The column is read as a checked fact.
     */
    expect(parseBirthYears("ALBION SC Portland BU10 Academy")).toEqual([]);
    expect(parseBirthYears("NSC BU14D")).toEqual([]);
  });

  it("does not read a squad number or a tier as a year", () => {
    expect(parseBirthYears("Crossfire Select BU14 B")).toEqual([]);
    expect(parseBirthYears("XF, U14, B12 - 13, RCL 1, Plackov")).toEqual([2012, 2013]);
  });

  it("reads a two-digit year as this century", () => {
    expect(parseBirthYears("XF G09-10 U17 ECNL")).toEqual([2009, 2010]);
  });

  it("says nothing about a name with no age in it", () => {
    expect(parseBirthYears("Allianz Burnaby")).toEqual([]);
    expect(parseBirthYears("烙饼FC")).toEqual([]);
  });
});

describe("formatBirthYears", () => {
  it("prints a school-year cohort the way people write it", () => {
    expect(formatBirthYears([2013, 2014])).toBe("2013/2014");
  });

  it("prints a single year on its own, for a calendar-year cycle", () => {
    expect(formatBirthYears([2013])).toBe("2013");
  });

  it("has nothing to print for a team nobody has dated", () => {
    expect(formatBirthYears([])).toBeNull();
    expect(formatBirthYears(null)).toBeNull();
  });
});

describe("parseGender", () => {
  it("reads the markers the platforms use", () => {
    expect(parseGender("Crossfire Select BU14 B")).toBe("boys");
    expect(parseGender("ALBION SC WA GU10")).toBe("girls");
    expect(parseGender("Apex FC Girls U14 Navy")).toBe("girls");
    expect(parseGender("90+ B17-18 Valdez")).toBe("boys");
    expect(parseGender("Sozo FC Boys U13 Gold MLS, Cuevas")).toBe("boys");
  });

  it("does not read a club's own name as a gender", () => {
    // "Blackhills" and "Green Devils" begin with the letters, and a looser
    // rule turns half the directory into boys and the other half into girls.
    expect(parseGender("Blackhills FC")).toBeNull();
    expect(parseGender("Green Devils")).toBeNull();
    expect(parseGender("Galaxy Rockets")).toBeNull();
  });

  it("says nothing when a name claims both", () => {
    // A coed or combined entry. Guessing one of them is worse than silence.
    expect(parseGender("Marymoor B14/G14 combined")).toBeNull();
  });

  it("says nothing when a name claims neither", () => {
    expect(parseGender("2015 Spuraways")).toBeNull();
  });
});

describe("parseBirthYearsInput", () => {
  it("takes the two shapes the cycle produces", () => {
    expect(parseBirthYearsInput("2013/2014")).toEqual({ ok: true, years: [2013, 2014] });
    expect(parseBirthYearsInput("2013-2014")).toEqual({ ok: true, years: [2013, 2014] });
    expect(parseBirthYearsInput("2013")).toEqual({ ok: true, years: [2013] });
    expect(parseBirthYearsInput("  2013 / 2014 ")).toEqual({
      ok: true,
      years: [2013, 2014],
    });
  });

  it("reads an empty box as clearing it", () => {
    expect(parseBirthYearsInput("")).toEqual({ ok: true, years: [] });
    expect(parseBirthYearsInput(null)).toEqual({ ok: true, years: [] });
  });

  it("refuses two years that do not run consecutively", () => {
    // An age group spans one school year. "2013/2015" is a typo, and stored
    // it would quietly widen the group.
    expect(parseBirthYearsInput("2013/2015").ok).toBe(false);
  });

  it("refuses shorthand a person might mean two ways", () => {
    /*
     * "13/14" is 2013/2014 in a team name and this parser could guess the
     * same — but here somebody is telling us rather than us interpreting, so
     * asking is better than assuming.
     */
    expect(parseBirthYearsInput("13/14").ok).toBe(false);
    expect(parseBirthYearsInput("U13").ok).toBe(false);
    expect(parseBirthYearsInput("2013/2014/2015").ok).toBe(false);
  });

  it("refuses a number that is not a birth year", () => {
    expect(parseBirthYearsInput("1899").ok).toBe(false);
  });
});

describe("deriving years from a U-number", () => {
  it("reads the U-number a name states", () => {
    expect(parseAgeGroup("XF, U14, B12 - 13, RCL 1, Plackov")).toBe(14);
    expect(parseAgeGroup("Crossfire Select BU14 B")).toBe(14);
    expect(parseAgeGroup("NSC BU10D Dragons")).toBe(10);
    expect(parseAgeGroup("Allianz Burnaby")).toBeNull();
  });

  it("refuses a number that is not an age group", () => {
    // "U2" and "U40" are a squad label or a typo, not a youth age group.
    expect(parseAgeGroup("Some Team U2")).toBeNull();
    expect(parseAgeGroup("Some Team U40")).toBeNull();
  });

  it("turns U12 in the 2026 season into 2014/2015", () => {
    // The owner's own example, and the rule the imports agree on.
    expect(birthYearsForAgeGroup(12, 2026)).toEqual([2014, 2015]);
    expect(birthYearsForAgeGroup(13, 2026)).toEqual([2013, 2014]);
    expect(birthYearsForAgeGroup(8, 2026)).toEqual([2018, 2019]);
  });

  it("puts a summer tournament in the season it is playing for", () => {
    /*
     * Clubs move to next season's age groups in the spring, so a June
     * tournament is already playing the coming season's U12. Verified across
     * six events from May to September 2026: 182 of 185 teams naming both a
     * U-number and their years agree on season 2026.
     */
    expect(seasonYearOf(new Date("2026-06-26T00:00:00Z"))).toBe(2026);
    expect(seasonYearOf(new Date("2026-05-01T00:00:00Z"))).toBe(2026);
    expect(seasonYearOf(new Date("2026-09-05T00:00:00Z"))).toBe(2026);
  });

  it("puts a midwinter event in the season already running", () => {
    // February 2027 is still the 2026 season. No event here falls in this
    // range, so the cutoff is reasoned rather than measured.
    expect(seasonYearOf(new Date("2027-02-10T00:00:00Z"))).toBe(2026);
  });

  it("agrees with what the names already say", () => {
    // The check that made deriving defensible: where a name states both, the
    // derivation reproduces it.
    expect(birthYearsForAgeGroup(13, 2026)).toEqual(
      parseBirthYears("Crossfire Select U13 B13-14 C"),
    );
    expect(birthYearsForAgeGroup(10, 2026)).toEqual(
      parseBirthYears("XF U10 B16-17 RCL 3"),
    );
    expect(birthYearsForAgeGroup(8, 2026)).toEqual(
      parseBirthYears("XF BU8 (18-19) RCL 1, Legg"),
    );
  });
});

describe("age groups for a season", () => {
  it("names the group a team is in this season", () => {
    expect(ageGroupOf([2014, 2015], "boys", 2026)).toBe("BU12");
    expect(ageGroupOf([2013, 2014], "girls", 2026)).toBe("GU13");
  });

  it("puts a single year and its pair in the same group", () => {
    /*
     * Both appear in the data: a name saying "B2014" and one saying "B14-15"
     * describe the same children. Matching whole arrays would file them as
     * different groups and split a club's squad in two.
     */
    expect(ageGroupOf([2014], "girls", 2026)).toBe("GU12");
    expect(ageGroupOf([2014, 2015], "girls", 2026)).toBe("GU12");
  });

  it("moves the same team up a group next season", () => {
    // The reason the label is computed and the years are stored.
    expect(ageGroupOf([2014, 2015], "boys", 2026)).toBe("BU12");
    expect(ageGroupOf([2014, 2015], "boys", 2027)).toBe("BU13");
  });

  it("has no group for a team missing either fact", () => {
    expect(ageGroupOf([], "boys", 2026)).toBeNull();
    expect(ageGroupOf([2014], null, 2026)).toBeNull();
    // Coed teams exist here and belong to neither chip.
    expect(ageGroupOf([2014], "coed", 2026)).toBeNull();
  });

  it("round-trips a chip back to the years it means", () => {
    expect(parseAgeGroupFilter("BU12", 2026)).toEqual({
      gender: "boys",
      firstBirthYear: 2014,
    });
    expect(parseAgeGroupFilter("gu14", 2026)).toEqual({
      gender: "girls",
      firstBirthYear: 2012,
    });
  });

  it("refuses anything that is not a group", () => {
    expect(parseAgeGroupFilter("U12", 2026)).toBeNull();
    expect(parseAgeGroupFilter("BU99", 2026)).toBeNull();
    expect(parseAgeGroupFilter("", 2026)).toBeNull();
    expect(parseAgeGroupFilter(null, 2026)).toBeNull();
  });
});
