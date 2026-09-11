import { describe, expect, it } from "vitest";

import { EMPTY_PROFILE, forPrompt, saysSomething, type ClubProfile } from "./profile";

const base: ClubProfile = {
  ...EMPTY_PROFILE,
  slug: "x",
  readAt: "2026-09-11T00:00:00.000Z",
  model: "test",
};

describe("saysSomething", () => {
  it("is false for a club whose site we could not read", () => {
    expect(saysSomething(base)).toBe(false);
  });

  it("is true once anything at all was read", () => {
    expect(saysSomething({ ...base, tiers: ["Premier"] })).toBe(true);
    expect(saysSomething({ ...base, coaches: [{ name: "Ana", role: null, ageGroups: [] }] })).toBe(true);
    expect(saysSomething({ ...base, ageBands: "two-year" })).toBe(true);
  });

  it("does not count 'this club uses no colours' as knowing nothing", () => {
    // "none" is a reading; "unknown" is a failure to read. Only the second is empty.
    expect(saysSomething({ ...base, colours: "none" })).toBe(false);
    expect(saysSomething({ ...base, colours: "squad" })).toBe(true);
  });
});

describe("forPrompt", () => {
  it("says the thing that decides a merge", () => {
    const line = forPrompt({
      ...base,
      tiers: ["Elite", "Premier"],
      branches: ["Bellevue", "Tacoma"],
      colours: "squad",
      ageBands: "single-year",
    });
    expect(line).toContain("Elite > Premier");
    expect(line).toContain("Bellevue, Tacoma");
    expect(line).toContain("a colour in a name is a squad");
    expect(line).toContain("one birth year");
  });

  it("leaves out the coaches, who never decide one", () => {
    const line = forPrompt({ ...base, coaches: [{ name: "Ana Ruiz", role: null, ageGroups: [] }] });
    expect(line).not.toContain("Ana Ruiz");
  });

  it("is empty when nothing was read, rather than misleadingly short", () => {
    expect(forPrompt(base)).toBe("");
  });
});
