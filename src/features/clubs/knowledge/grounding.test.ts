import { describe, expect, it } from "vitest";

import { ground, grounded } from "./grounding";
import { EMPTY_PROFILE, type ClubProfile } from "./profile";

const base: ClubProfile = {
  ...EMPTY_PROFILE,
  slug: "x",
  readAt: "2026-09-11T00:00:00.000Z",
  model: "test",
};

describe("grounded", () => {
  const lines = (...rows: string[]) => rows;

  it("ignores case, punctuation and spacing", () => {
    expect(grounded(lines("we run an elite academy for boys"), "Elite Academy (EA)")).toBe(true);
  });

  it("is false for a phrase nobody wrote", () => {
    expect(grounded(lines("our story where dreams are enabled"), "MLS NEXT")).toBe(false);
  });

  /*
   * The failure this check was rewritten for. Atletico's page contains "mls"
   * and contains "next"; it does not contain "MLS NEXT". Asking only whether
   * each word appears somewhere let the invented tier through the guard that
   * existed to stop it.
   */
  it("refuses two words that appear apart rather than together", () => {
    expect(grounded(lines("mls watch party", "next tryout is sunday"), "MLS NEXT")).toBe(false);
    expect(grounded(lines("we play in mls next this season"), "MLS NEXT")).toBe(true);
  });

  it("refuses a phrase straddling two lines", () => {
    expect(grounded(lines("Elite", "Academy"), "Elite Academy")).toBe(false);
  });

  it("keeps a short word in the middle of a phrase", () => {
    // "Crossfire Jr Teams" is on their page word for word. Stripping every
    // short word turned it into "crossfire teams", which is not.
    expect(grounded(lines("crossfire jr teams"), "Crossfire Jr Teams")).toBe(true);
    expect(grounded(lines("crossfire premier teams"), "Crossfire Jr Teams")).toBe(false);
  });

  it("does not find a short word inside a longer one", () => {
    expect(grounded(lines("our nplayers train weekly"), "NPL")).toBe(false);
  });

  it("is false for an empty phrase", () => {
    expect(grounded(lines("anything at all"), "   ")).toBe(false);
  });
});

describe("ground", () => {
  /* A page that describes a club without ever stating how it is organised. */
  const thin = [
    {
      text: 'Atlético "Where dreams are enabled" for all.\nFREE 4v4 Futbol for Kids.\nKickoff Jamboree - Nov 9.\nOur Programs.\nOur Coaches.\nFinancial Assistance.',
    },
  ];

  it("drops tiers the page never mentions, and the summary that rested on them", () => {
    const { profile, dropped } = ground(
      { ...base, tiers: ["MLS NEXT", "Elite Academy"], summary: "This club runs MLS NEXT." },
      thin,
    );
    expect(profile.tiers).toEqual([]);
    expect(profile.summary).toBe("");
    expect(dropped).toEqual(["tier: MLS NEXT", "tier: Elite Academy"]);
  });

  it("keeps what the page does say", () => {
    const pages = [{ text: "Our ECNL and Premier teams. B13 Red and B13 Grey train together." }];
    const { profile, dropped } = ground(
      { ...base, tiers: ["ECNL", "Premier", "USSDA"], squadMarkers: ["Red", "Grey"] },
      pages,
    );
    expect(profile.tiers).toEqual(["ECNL", "Premier"]);
    expect(profile.squadMarkers).toEqual(["Red", "Grey"]);
    expect(dropped).toEqual(["tier: USSDA"]);
  });

  it("drops a coach nobody named", () => {
    const { profile } = ground(
      {
        ...base,
        coaches: [
          { name: "Ana Ruiz", role: null, ageGroups: [] },
          { name: "Invented Person", role: null, ageGroups: [] },
        ],
      },
      [{ text: "Coaching staff: Ana Ruiz, Director." }],
    );
    expect(profile.coaches.map((c) => c.name)).toEqual(["Ana Ruiz"]);
  });

  it("refuses a colour rule when the pages contain no colour", () => {
    const { profile } = ground({ ...base, colours: "mixed" }, thin);
    expect(profile.colours).toBe("unknown");
  });

  it("keeps a colour rule when they do", () => {
    const { profile } = ground({ ...base, colours: "squad" }, [
      { text: "Our Azul, Rojo and Oro sides." },
    ]);
    expect(profile.colours).toBe("squad");
  });

  it("refuses an age-band reading when no page writes an age", () => {
    expect(ground({ ...base, ageBands: "two-year" }, thin).profile.ageBands).toBe("unknown");
    expect(
      ground({ ...base, ageBands: "two-year" }, [{ text: "B13/14 and G11 squads" }]).profile
        .ageBands,
    ).toBe("two-year");
  });

  it("keeps the summary once anything at all survived", () => {
    const { profile } = ground({ ...base, tiers: ["Premier"], summary: "A real summary." }, [
      { text: "Our Premier teams." },
    ]);
    expect(profile.summary).toBe("A real summary.");
  });
});
