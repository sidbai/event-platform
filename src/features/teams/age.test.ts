import { describe, expect, it } from "vitest";

import {
  formatBirthYears,
  parseBirthYears,
  parseBirthYearsInput,
  parseGender,
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
