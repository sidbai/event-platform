import { describe, expect, it } from "vitest";

import { buildReadPrompt, parseProfile } from "./read-prompt";

const ABOUT = {
  slug: "atletico-futbol-club",
  sources: ["https://atleticofutbol.com"],
  model: "test",
  readAt: "2026-09-11T00:00:00.000Z",
};

describe("buildReadPrompt", () => {
  it("names the club and carries every page", () => {
    const prompt = buildReadPrompt(
      { name: "Atletico FC", website: "https://atleticofutbol.com" },
      [
        { url: "https://atleticofutbol.com/teams", text: "Azul Rojo Oro" },
        { url: "https://atleticofutbol.com/coaches", text: "Ana Ruiz" },
      ],
    );
    expect(prompt).toContain("Atletico FC");
    expect(prompt).toContain("Azul Rojo Oro");
    expect(prompt).toContain("https://atleticofutbol.com/coaches");
  });
});

describe("parseProfile", () => {
  it("reads a well-formed answer", () => {
    const profile = parseProfile(
      JSON.stringify({
        tiers: ["Elite", "Premier", "Select"],
        squadMarkers: ["Azul", "Rojo", "Oro"],
        colours: "squad",
        ageBands: "two-year",
        branches: ["Bellevue", "Tacoma"],
        coaches: [{ name: "Ana Ruiz", role: "Director of Coaching", ageGroups: ["Boys 2013"] }],
        summary: "  Names its sides   by colour.  ",
      }),
      ABOUT,
    );
    expect(profile.tiers).toEqual(["Elite", "Premier", "Select"]);
    expect(profile.colours).toBe("squad");
    expect(profile.ageBands).toBe("two-year");
    expect(profile.coaches).toEqual([
      { name: "Ana Ruiz", role: "Director of Coaching", ageGroups: ["Boys 2013"] },
    ]);
    expect(profile.summary).toBe("Names its sides by colour.");
    expect(profile.slug).toBe("atletico-futbol-club");
  });

  it("finds JSON inside a code fence", () => {
    const profile = parseProfile('```json\n{"tiers":["Premier"]}\n```', ABOUT);
    expect(profile.tiers).toEqual(["Premier"]);
  });

  it("refuses an enum nobody offered", () => {
    const profile = parseProfile('{"colours":"colourful","ageBands":"yearly"}', ABOUT);
    expect(profile.colours).toBe("unknown");
    expect(profile.ageBands).toBe("unknown");
  });

  it("survives prose instead of an answer", () => {
    const profile = parseProfile("I could not find that information.", ABOUT);
    expect(profile.tiers).toEqual([]);
    expect(profile.coaches).toEqual([]);
    expect(profile.slug).toBe("atletico-futbol-club");
  });

  it("drops a coach with no name, and keeps one with no role", () => {
    const profile = parseProfile(
      JSON.stringify({ coaches: [{ role: "Head Coach" }, { name: "Sam Cole" }] }),
      ABOUT,
    );
    expect(profile.coaches).toEqual([{ name: "Sam Cole", role: null, ageGroups: [] }]);
  });

  it("counts a coach listed on three pages once", () => {
    const profile = parseProfile(
      JSON.stringify({
        coaches: [{ name: "Ana Ruiz" }, { name: "ana ruiz" }, { name: "Sam Cole" }],
      }),
      ABOUT,
    );
    expect(profile.coaches.map((c) => c.name)).toEqual(["Ana Ruiz", "Sam Cole"]);
  });

  it("caps a model that answers with four hundred tiers", () => {
    const profile = parseProfile(
      JSON.stringify({ tiers: Array.from({ length: 400 }, (_, i) => `Tier ${i}`) }),
      ABOUT,
    );
    expect(profile.tiers).toHaveLength(10);
  });

  it("de-duplicates a repeated tier without caring about case", () => {
    const profile = parseProfile('{"tiers":["Premier","premier","Select"]}', ABOUT);
    expect(profile.tiers).toEqual(["Premier", "Select"]);
  });
});
