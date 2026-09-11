import { describe, expect, it } from "vitest";

import { LEAGUES, leagueFetchBookmarklet, leagueFetchSource } from "./league-bookmark";

describe("the weekly bookmark", () => {
  it("is JavaScript a browser can parse", () => {
    // Parsed, never run: the source fetches from two platforms.
    expect(() => new Function(leagueFetchSource())).not.toThrow();
  });

  it("carries every league but not our own slugs", () => {
    const src = leagueFetchSource();
    for (const l of LEAGUES) {
      expect(src).toContain(JSON.stringify(l.name));
      expect(src).not.toContain(l.eventSlug);
    }
  });

  it("knows both platforms, and which site each has to be clicked on", () => {
    const src = leagueFetchSource();
    expect(src).toContain("api.athleteone.com");
    expect(src).toContain("system.gotsport.com");
    expect(src).toContain("theecnl.com");
    // One file per site, so a week's two clicks do not overwrite each other.
    expect(src).toContain("-northwest-all.json");
    expect(src).toContain("schedules?date=All&group=");
    // The GA events are national, and list a "Northwest" beside our
    // "Pacific-Northwest"; only the Pacific one is taken.
    expect(src).toContain("Pac(ific)?[- ]?Northwest");
    expect(new RegExp("Pac(ific)?[- ]?Northwest", "i").test("Pacific-Northwest U13")).toBe(true);
    expect(new RegExp("Pac(ific)?[- ]?Northwest", "i").test("Northwest U13")).toBe(false);
  });

  it("fits in a bookmark", () => {
    const url = leagueFetchBookmarklet();
    expect(url.startsWith("javascript:")).toBe(true);
    // Chrome and Safari take a bookmark URL well past 64K; this is a leash,
    // not a limit, so a stray hundred kilobytes of pasted HTML is noticed.
    expect(url.length).toBeLessThan(16_000);
  });
});
