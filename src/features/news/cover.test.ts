import { describe, expect, it } from "vitest";

import { coverMaxWidth, TALLEST_COVER } from "./cover";

describe("coverMaxWidth", () => {
  it("lets a landscape cover fill the column", () => {
    // The 900x506 cover that started this: it should be as wide as the
    // article, not as wide as whichever srcSet candidate was downloaded.
    expect(coverMaxWidth(900, 506)).toBeUndefined();
    expect(coverMaxWidth(3000, 2000)).toBeUndefined();
  });

  it("lets a square cover fill the column", () => {
    expect(coverMaxWidth(800, 800)).toBeUndefined();
  });

  it("holds a portrait cover to a readable height", () => {
    // 960x1200 at full column width would be ~960 tall and bury the article.
    const max = coverMaxWidth(960, 1200);
    expect(max).toBe(512);
    // The implied height is the cap, which is the whole point.
    expect(Math.round(max! * (1200 / 960))).toBe(TALLEST_COVER);
  });

  it("holds a very tall photo tighter still", () => {
    const max = coverMaxWidth(1000, 4000);
    expect(max).toBe(160);
    expect(Math.round(max! * (4000 / 1000))).toBe(TALLEST_COVER);
  });

  it("treats nonsense dimensions as unknown rather than hiding the cover", () => {
    // A maxWidth of 0 would render it invisible, which is worse than uncapped.
    expect(coverMaxWidth(0, 1200)).toBeUndefined();
    expect(coverMaxWidth(-5, 10)).toBeUndefined();
  });
});
