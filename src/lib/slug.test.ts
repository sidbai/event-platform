import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("5th Annual King Juan Cup")).toBe("5th-annual-king-juan-cup");
  });

  it("strips leading/trailing and repeated separators", () => {
    expect(slugify("  Hello --- World!  ")).toBe("hello-world");
  });

  it("folds accents", () => {
    expect(slugify("Café Ñandú")).toBe("cafe-nandu");
  });

  it("drops characters with no ascii form (caller must supply a fallback)", () => {
    expect(slugify("吃饼FC")).toBe("fc");
  });

  it("caps length at 60", () => {
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
});
