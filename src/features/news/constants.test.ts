import { describe, expect, it } from "vitest";

import {
  categoryEmoji,
  categoryLabel,
  parseCategory,
  readingMinutes,
} from "./constants";

describe("parseCategory", () => {
  it("accepts the known categories", () => {
    expect(parseCategory("recap")).toBe("recap");
    expect(parseCategory("announcement")).toBe("announcement");
  });

  it("refuses anything else rather than defaulting silently", () => {
    // the value reaches the DB enum, so a bad one must not slip through
    for (const bad of ["", "salaries", null, undefined, 7, {}]) {
      expect(parseCategory(bad)).toBeNull();
    }
  });
});

describe("category display", () => {
  it("falls back for an unknown key instead of rendering blank", () => {
    expect(categoryLabel("who-knows")).toBe("News");
    expect(categoryEmoji("who-knows")).toBeTruthy();
  });
});

describe("readingMinutes", () => {
  it("never returns zero", () => {
    // "0 min read" reads as broken; a short post is still a 1 min read
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("three short words")).toBe(1);
  });

  it("scales with length", () => {
    expect(readingMinutes("word ".repeat(400))).toBe(2);
    expect(readingMinutes("word ".repeat(1000))).toBe(5);
  });

  it("is not fooled by runs of whitespace", () => {
    expect(readingMinutes("a\n\n\n   b\t\tc")).toBe(1);
  });
});
