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
  it("ignores case, punctuation and spacing", () => {
    expect(grounded("we run an elite academy for boys", "Elite Academy (EA)")).toBe(true);
  });

  it("is false for a phrase nobody wrote", () => {
    expect(grounded("our story where dreams are enabled", "MLS NEXT")).toBe(false);
  });

  it("does not find a short word inside a longer one", () => {
    expect(grounded("our nplayers train weekly", "NPL")).toBe(false);
  });

  it("is false for an empty phrase", () => {
    expect(grounded("anything at all", "   ")).toBe(false);
  });
});

describe("ground", () => {
  /*
   * The case this exists for, kept verbatim: Atletico's home page is a
   * mission statement and a jamboree flyer, and the first run recorded two
   * tiers from it that appear nowhere on the page.
   */
  const atletico = [
    {
      text: 'Atlético "Where dreams are enabled" for all. FREE 4v4 Futbol for Kids. Kickoff Jamboree - Nov 9. Our Programs. Our Coaches. Financial Assistance.',
    },
  ];

  it("drops tiers the page never mentions, and the summary that rested on them", () => {
    const { profile, dropped } = ground(
      { ...base, tiers: ["MLS NEXT", "Elite Academy"], summary: "Atletico runs MLS NEXT." },
      atletico,
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
    const { profile } = ground({ ...base, colours: "mixed" }, atletico);
    expect(profile.colours).toBe("unknown");
  });

  it("keeps a colour rule when they do", () => {
    const { profile } = ground({ ...base, colours: "squad" }, [
      { text: "Our Azul, Rojo and Oro sides." },
    ]);
    expect(profile.colours).toBe("squad");
  });

  it("refuses an age-band reading when no page writes an age", () => {
    expect(ground({ ...base, ageBands: "two-year" }, atletico).profile.ageBands).toBe("unknown");
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
