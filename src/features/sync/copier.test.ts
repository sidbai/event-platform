import { describe, expect, it } from "vitest";

import { CANONICAL_HEADER } from "./paste";

import { copierBookmarklet } from "./copier";

const body = () => decodeURIComponent(copierBookmarklet().slice("javascript:".length));

describe("the copier bookmarklet", () => {
  it("is valid JavaScript", () => {
    /*
     * The test the first version did not have, and the bug it would have
     * caught: minifying stripped the newlines but left the trailing `//`
     * comments, so each one swallowed the statement that followed it onto the
     * same line. The source was verified in a browser; the artifact was not,
     * and the artifact is what a person clicks.
     */
    expect(() => new Function(body())).not.toThrow();
  });

  it("carries no comment that has eaten the code after it", () => {
    for (const line of body().split("\n")) {
      const comment = line.indexOf("//");
      if (comment === -1) continue;
      expect(line.slice(comment)).not.toMatch(/\bvar\b|\breturn\b/);
    }
  });

  it("emits the columns the importer reads", () => {
    // The two halves have to agree on the header or every paste is skipped.
    expect(body()).toContain(JSON.stringify(CANONICAL_HEADER));
  });

  it("is short enough to live in a bookmark", () => {
    // Browsers have historically capped bookmark URLs; a few kilobytes is
    // safe everywhere and this has no reason to grow much.
    expect(copierBookmarklet().length).toBeLessThan(8000);
  });

  it("asks for nothing from the network", () => {
    // The one property that makes this not a crawler: it reads what is
    // already on the screen.
    expect(body()).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|import\s*\(/);
  });
});
