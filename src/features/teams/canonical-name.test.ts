import { describe, expect, it } from "vitest";
import { canonicalName, cohortLabel, leadOf, remainderOf } from "./canonical-name";

const crossfire = { name: "Crossfire Premier", slug: "crossfire-premier", aliases: ["xf"] };
const seattleUnited = { name: "Seattle United", slug: "seattle-united", aliases: ["seattleunited"] };
const eastside = { name: "Eastside FC", slug: "eastside-fc", aliases: [] };

function name(over: Partial<Parameters<typeof canonicalName>[0]>) {
  return canonicalName({
    name: "",
    club: null,
    gender: "boys",
    birthYears: [2013, 2014],
    tier: null,
    program: null,
    ...over,
  });
}

describe("cohortLabel", () => {
  it("writes the two years the age cycle spans", () => {
    expect(cohortLabel("boys", [2013, 2014])).toBe("B13/14");
    expect(cohortLabel("girls", [2009, 2010])).toBe("G09/10");
  });

  it("writes a single year as one", () => {
    expect(cohortLabel("boys", [2015])).toBe("B15");
  });

  it("says nothing when it does not know", () => {
    expect(cohortLabel(null, [2013, 2014])).toBeNull();
    expect(cohortLabel("boys", [])).toBeNull();
  });
});

describe("canonicalName", () => {
  it("writes the club, the cohort and the tier in that order", () => {
    expect(name({ name: "XF U12 B13/14 ECNL 1", club: crossfire })).toBe(
      "Crossfire Premier B13/14 ECNL 1",
    );
  });

  it("puts the club's own stream before the cohort", () => {
    expect(name({ name: "Crossfire Select B13-14", club: crossfire })).toBe(
      "Crossfire Premier Select B13/14",
    );
  });

  it("puts a branch before the cohort too, not after the tier", () => {
    expect(
      name({
        name: "Seattle United Shoreline BU12 Blue",
        club: seattleUnited,
        birthYears: [2014, 2015],
      }),
    ).toBe("Seattle United Shoreline B14/15 Blue");
    expect(
      name({
        name: "Eastside FC BU15 West Red",
        club: eastside,
        birthYears: [2015, 2016],
      }),
    ).toBe("Eastside FC West B15/16 Red");
  });

  it("keeps the squad letter, which is all that tells two sides apart", () => {
    expect(
      name({ name: "Crossfire Select B-U10A Matisz", club: crossfire, birthYears: [2016, 2017] }),
    ).toBe("Crossfire Premier Select B16/17 A Matisz");
    expect(
      name({ name: "Crossfire Select B-U10B Litke", club: crossfire, birthYears: [2016, 2017] }),
    ).toBe("Crossfire Premier Select B16/17 B Litke");
  });

  it("reads a trailing B as the gender when nothing else has said it", () => {
    // "U16B" is the boys' U16, not the B side — there is no other gender mark.
    expect(name({ name: "Albion SC Idaho U16B", birthYears: [2010, 2011] })).toBe(
      "Albion SC Idaho B10/11",
    );
  });

  it("keeps the coach's surname, and does not have to know it is one", () => {
    expect(name({ name: "Eastside FC GU12 Lombard", club: eastside, gender: "girls" })).toBe(
      "Eastside FC G13/14 Lombard",
    );
  });

  it("keeps a nickname it cannot classify rather than dropping it", () => {
    expect(name({ name: "Seattle United - B13 Samba", club: seattleUnited, birthYears: [2013] })).toBe(
      "Seattle United Samba B13",
    );
    expect(name({ name: "LWPFC B17/18 White Sharks", birthYears: [2017, 2018] })).toBe(
      "LWPFC B17/18 White Sharks",
    );
  });

  it("says the club once when the export said it twice", () => {
    expect(
      name({ name: "Capital FC - Capital FC B15 Pre-ECNL 1", birthYears: [2015] }),
    ).toBe("Capital FC B15 Pre-ECNL 1");
  });

  it("recognises the club under an alias and under its initials", () => {
    expect(name({ name: "XF BU14 ECNL 1", club: crossfire, birthYears: [2012, 2013] })).toBe(
      "Crossfire Premier B12/13 ECNL 1",
    );
    expect(
      name({
        name: "Washington Premier FC - WPFC BU13 ECNL",
        club: { name: "Washington Premier FC", slug: "wpfc", aliases: [] },
      }),
    ).toBe("Washington Premier FC B13/14 ECNL");
  });

  it("normalises the tier's spelling, typo and all", () => {
    expect(name({ name: "Valor GU13 ECNL-RL", gender: "girls" })).toBe("Valor G13/14 ECNL RL");
    expect(name({ name: "Crossfire G2012/13 ENCL RL", club: crossfire, gender: "girls", birthYears: [2012, 2013] })).toBe(
      "Crossfire Premier G12/13 ECNL RL",
    );
  });

  it("prefers the fuller of two readings of one tier", () => {
    // The column is a summary of the name and goes stale a division behind it.
    expect(name({ name: "XF U16 B10-11 RCL-1", club: crossfire, tier: "RCL", birthYears: [2010, 2011] })).toBe(
      "Crossfire Premier B10/11 RCL 1",
    );
  });

  it("leaves the published name alone when it cannot say as much", () => {
    // No club record and no birth years: there is nothing to build from, and
    // half a name is worse than somebody else's whole one.
    expect(name({ name: "WVFC Benfica", birthYears: [], gender: null })).toBe("WVFC Benfica");
  });

  it("does not leave a bracket that closes nothing", () => {
    expect(name({ name: "EFC B2013 Yellow (Nitros)", birthYears: [2013] })).toBe(
      "EFC B13 Yellow (Nitros)",
    );
    expect(name({ name: "Atletico - BU12 (B15) Pre MLS Next", birthYears: [2015] })).toBe(
      "Atletico B15 Pre-MLS Next",
    );
  });

  it("prints the branch and the stream, branch first", () => {
    // Western Washington Surf runs an Academy in each of North, Central and
    // South; the name has to say which of the nine sides this is.
    expect(
      name({
        name: "WW SURF BU10 Central Academy A",
        club: { name: "Western Washington Surf", slug: "western-washington-surf", aliases: ["wwsurf"] },
        birthYears: [2016, 2017],
      }),
    ).toBe("Western Washington Surf Central Academy B16/17 A");
  });

  it("finds the club after the age group when the name leads with one", () => {
    // The Liga Azteca exports write the age group first.
    expect(name({ name: "BU12 Liga Azteca - Cosmos", birthYears: [2014, 2015] })).toBe(
      "Liga Azteca B14/15 Cosmos",
    );
  });

  it("reads a two-group side either way round", () => {
    expect(
      name({
        name: "WW Surf BU12/U11 Academy South B",
        club: { name: "Western Washington Surf", slug: "western-washington-surf", aliases: ["wwsurf"] },
        birthYears: [2014, 2015],
      }),
    ).toBe("Western Washington Surf South Academy B14/15 B");
  });

  it("refuses to print a season that was stored as a cohort", () => {
    // Five U10 sides hold {2026, 2027}, which is the season the name states.
    // Printing it would write the mistake into the name, where it stops
    // looking like one.
    expect(
      name({
        name: "26/27 Portland Thorns Academy U10",
        gender: "girls",
        birthYears: [2026, 2027],
      }),
    ).toBe("26/27 Portland Thorns Academy U10");
  });

  it("is idempotent — running it twice changes nothing", () => {
    const once = name({ name: "Eastside FC (WA) - EASTSIDE FC BU12 White", club: eastside, birthYears: [2014, 2015] });
    expect(once).toBe("Eastside FC B14/15 White");
    expect(name({ name: once, club: eastside, birthYears: [2014, 2015] })).toBe(once);
  });
});

describe("remainderOf", () => {
  it("carries through what no column accounts for", () => {
    expect(
      remainderOf({
        name: "NSC Aces, BU16, Weyer",
        club: { name: "Northshore Select Club", slug: "nsc", aliases: ["nsc"] },
        gender: "boys",
        birthYears: [2010, 2011],
        tier: null,
        program: null,
      }),
    ).toBe("Aces Weyer");
  });
});

describe("leadOf", () => {
  it("is everything before the age group", () => {
    expect(leadOf("Three Rivers Soccer Club - GU14 Chang")).toBe("Three Rivers Soccer Club");
  });

  it("keeps the fuller of two spellings of one club", () => {
    expect(leadOf("Albion SC Washington - ALBION SC WA BU15 Academy")).toBe(
      "Albion SC Washington",
    );
  });
});
