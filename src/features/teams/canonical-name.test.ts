import { describe, expect, it } from "vitest";
import { canonicalName, cohortLabel, remainderOf } from "./canonical-name";

const crossfire = { name: "Crossfire Premier", slug: "crossfire-premier", aliases: ["xf"] };
const seattleUnited = { name: "Seattle United", slug: "seattle-united", aliases: ["seattleunited"] };
const eastside = { name: "Eastside FC", slug: "eastside-fc", aliases: [] };
const club = (name: string, slug = name.toLowerCase().replace(/\W+/g, "-")) => ({
  name,
  slug,
  aliases: [],
});

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
    expect(
      name({ name: "Albion SC Idaho U16B", club: club("Albion SC Idaho"), birthYears: [2010, 2011] }),
    ).toBe("Albion SC Idaho B10/11");
  });

  it("keeps the coach's surname, and does not have to know it is one", () => {
    expect(name({ name: "Eastside FC GU12 Lombard", club: eastside, gender: "girls" })).toBe(
      "Eastside FC G13/14 Lombard",
    );
  });

  it("keeps a nickname it cannot classify rather than dropping it", () => {
    // Copa, Tango and Samba are tiers: three Seattle United sides share 2011
    // boys and nothing but these tell them apart. So they read where a tier
    // reads, after the cohort, not in front of it like a branch.
    expect(name({ name: "Seattle United - B13 Samba", club: seattleUnited, birthYears: [2013] })).toBe(
      "Seattle United B13 Samba",
    );
    expect(name({ name: "Seattle United Copa B16", club: seattleUnited, birthYears: [2016] })).toBe(
      "Seattle United B16 Copa",
    );
    expect(
      name({
        name: "LWPFC B17/18 White Sharks",
        club: { name: "Lake Washington Premier FC", slug: "lwpfc", aliases: ["lwpfc"] },
        birthYears: [2017, 2018],
      }),
    ).toBe("Lake Washington Premier FC B17/18 White Sharks");
  });

  it("says the club once when the export said it twice", () => {
    expect(
      name({
        name: "Capital FC - Capital FC B15 Pre-ECNL 1",
        club: club("Capital FC"),
        birthYears: [2015],
      }),
    ).toBe("Capital FC B15 Pre-ECNL 1");
  });

  it("recognises the club under an alias and under its initials", () => {
    // "Eastside FC" is written EFC, "Washington Premier FC" WPFC — computed,
    // because only twelve clubs have an alias recorded.
    expect(name({ name: "Eastside FC (WA) - EFC BU14 ECRL", club: eastside, birthYears: [2012, 2013] })).toBe(
      "Eastside FC B12/13 ECNL RL",
    );
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
    expect(name({ name: "Valor GU13 ECNL-RL", club: club("Valor Soccer"), gender: "girls" })).toBe(
      "Valor Soccer G13/14 ECNL RL",
    );
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

  it("leaves a team with no club alone", () => {
    // A pickup side or a visitor nobody has filed has no fixed vocabulary
    // behind its name, and the words it leads with are as likely to be its own
    // as a club's. There is nothing to normalise it against.
    expect(name({ name: "BU12 Liga Azteca - Cosmos", birthYears: [2014, 2015] })).toBe(
      "BU12 Liga Azteca - Cosmos",
    );
    expect(name({ name: "WVFC Benfica" })).toBe("WVFC Benfica");
  });

  it("leaves a club team alone when nobody has established its years", () => {
    expect(
      name({ name: "Dragons FC", club: club("Dragons FC"), birthYears: [], gender: null }),
    ).toBe("Dragons FC");
  });

  it("does not leave a bracket that closes nothing", () => {
    expect(
      name({
        name: "Eastside FC - EFC B2013 Yellow (Nitros)",
        club: eastside,
        birthYears: [2013],
      }),
    ).toBe("Eastside FC B13 Yellow (Nitros)");
    expect(
      name({
        name: "Atletico - BU12 (B15) Pre MLS Next",
        club: club("Atletico Futbol Club"),
        birthYears: [2015],
      }),
    ).toBe("Atletico Futbol Club B15 Pre-MLS Next");
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
        club: club("Portland Thorns Academy"),
        gender: "girls",
        birthYears: [2026, 2027],
      }),
    ).toBe("26/27 Portland Thorns Academy U10");
  });

  it("drops a year the age-group cut left standing on its own", () => {
    // "B13 14" is one cohort written apart, and the stray reads as a squad
    // number once the pair is cut out.
    expect(
      name({
        name: "LWPFC N1 B13 14",
        club: { name: "Lake Washington Premier FC", slug: "lwpfc", aliases: ["lwpfc"] },
        birthYears: [2013],
      }),
    ).toBe("Lake Washington Premier FC B13 National 1");
    expect(
      name({ name: "Seattle United B09/10 Blue 09", club: seattleUnited, birthYears: [2009, 2010] }),
    ).toBe("Seattle United B09/10 Blue");
  });

  it("keeps a squad number, which is not a year", () => {
    // MRFC's second Academy side of that age. The 2 is the whole of what
    // says so.
    expect(
      name({ name: "MRFC B09/10 Academy 2", club: club("Mount Rainier FC"), birthYears: [2009, 2010] }),
    ).toBe("Mount Rainier FC Academy B09/10 2");
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

/**
 * A club that goes by something shorter at the front of a team's name.
 *
 * The club is still Crossfire Premier wherever it is the subject — its page,
 * the directory, and the importer, which matches a schedule's "Crossfire
 * Premier B13/14" against the club's name. Here it is a prefix, and a page of
 * the full name is a column of the same two words with the team behind them.
 */
describe("a club's short name", () => {
  const xf = {
    name: "Crossfire Premier",
    slug: "crossfire-premier",
    aliases: ["xf", "crossfire"],
    shortName: "XF",
  };

  it("leads the name with the short form", () => {
    expect(name({ name: "Crossfire Premier B13/14 ECNL 2", club: xf, tier: "ECNL 2" })).toBe(
      "XF B13/14 ECNL 2",
    );
  });

  it("does not put back a word the club's own name was covering", () => {
    /*
     * The whole reason this is a second column and not a rename. "Premier" is
     * dropped because the club is called Crossfire Premier; printing the club
     * as "XF" must not turn its own word into a thing to announce, or all 157
     * of them read "XF Premier G11 ECNL".
     */
    expect(
      name({ name: "Crossfire Premier G11 ECNL", club: xf, gender: "girls", birthYears: [2011] }),
    ).toBe(
      "XF G11 ECNL",
    );
    expect(name({ name: "Crossfire Premier Select G14/15", club: xf, gender: "girls", birthYears: [2014, 2015] })).toBe(
      "XF Select G14/15",
    );
  });

  it("strips the short form too, wherever the source already used it", () => {
    expect(name({ name: "XF B13/14 ECNL 2", club: xf, tier: "ECNL 2" })).toBe(
      "XF B13/14 ECNL 2",
    );
  });

  it("leaves a club without one exactly as it was", () => {
    expect(name({ name: "Eastside FC BU13 Red", club: eastside })).toBe(
      "Eastside FC B13/14 Red",
    );
    expect(name({ name: "Eastside FC BU13 Red", club: { ...eastside, shortName: null } })).toBe(
      "Eastside FC B13/14 Red",
    );
  });

  it("keeps a short form of more than one word", () => {
    const wwSurf = {
      name: "Western Washington Surf",
      slug: "western-washington-surf",
      aliases: ["wwsurf"],
      shortName: "WW Surf",
    };
    // "Premier" here is the club's stream, not part of its name, so it stays.
    expect(
      name({
        name: "Western Washington Surf North Premier G07/08",
        club: wwSurf,
        gender: "girls",
        birthYears: [2007, 2008],
      }),
    ).toBe("WW Surf North Premier G07/08");
  });
});
