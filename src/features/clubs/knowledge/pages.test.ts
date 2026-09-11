import { describe, expect, it } from "vitest";

import { interestingUrls, scoreUrl } from "./pages";

/*
 * The URLs here are real, taken from the sitemaps of clubs in the directory.
 * A club's site is somebody else's design decision, and a made-up example
 * would only ever test our idea of one.
 */

describe("scoreUrl", () => {
  it("puts a club's own teams and coaches pages at the top", () => {
    expect(scoreUrl("https://www.crossfiresoccer.org/coaches/")).toBeGreaterThan(
      scoreUrl("https://www.crossfiresoccer.org/tryouts/boys/"),
    );
  });

  it("refuses an image attachment that happens to say team", () => {
    expect(
      scoreUrl("https://www.crossfiresoccer.org/teams/attachment/1900-x-600-boys-team-roma/"),
    ).toBe(0);
  });

  it("refuses news, however it is spelled", () => {
    expect(scoreUrl("https://x.org/latest-news/crossfire-players-walk-copa-america/")).toBe(0);
  });

  it("reads the pages that state the structure", () => {
    expect(scoreUrl("https://x.org/about-us/playing-for-crossfire/program-chart/")).toBeGreaterThan(0);
    expect(scoreUrl("https://westernwasurf.com/premier-outline-bellevue-2025/")).toBeGreaterThan(0);
  });

  it("prefers a section to something filed deep under it", () => {
    expect(scoreUrl("https://x.org/teams/")).toBeGreaterThan(
      scoreUrl("https://x.org/teams/xf-u8-spring-rcl-teams/2026-girls-u8-tryout-results/"),
    );
  });
});

describe("interestingUrls", () => {
  it("caps, ranks and de-duplicates", () => {
    const urls = [
      "https://x.org/latest-news/a/",
      "https://x.org/coaches/",
      "https://x.org/coaches",
      "https://x.org/tryouts/",
      "https://x.org/teams/",
      "https://x.org/shop/travel-gear/",
    ];
    const picked = interestingUrls(urls, 3);
    // The two section pages outrank tryouts; between themselves the order is
    // a tiebreak nobody should depend on, so it is not asserted.
    expect(picked.slice(0, 2).sort()).toEqual([
      "https://x.org/coaches/",
      "https://x.org/teams/",
    ]);
    expect(picked[2]).toBe("https://x.org/tryouts/");
    expect(picked).toHaveLength(3);
  });

  it("returns nothing when a sitemap is all news", () => {
    expect(interestingUrls(["https://x.org/news/one/", "https://x.org/news/two/"])).toEqual([]);
  });
});
