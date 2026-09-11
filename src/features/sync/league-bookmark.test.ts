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

  it("knows both platforms, and where it has to be clicked for one of them", () => {
    const src = leagueFetchSource();
    expect(src).toContain("api.athleteone.com");
    expect(src).toContain("system.gotsport.com");
    expect(src).toContain("schedules?date=All&group=");
    // The GA events are national; only the Northwest is taken.
    expect(src).toMatch(/"only":"Northwest"/);
  });

  it("fits in a bookmark", () => {
    const url = leagueFetchBookmarklet();
    expect(url.startsWith("javascript:")).toBe(true);
    expect(url.length).toBeLessThan(8000);
  });
});
