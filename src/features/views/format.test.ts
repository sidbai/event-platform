import { describe, expect, it } from "vitest";

import { formatViews, viewsLabel } from "./format";

describe("formatViews", () => {
  it("is exact while the number is small enough to mean something", () => {
    expect(formatViews(0)).toBe("0");
    expect(formatViews(1)).toBe("1");
    expect(formatViews(999)).toBe("999");
  });

  it("rounds thousands to one decimal, and drops a pointless one", () => {
    expect(formatViews(1000)).toBe("1k");
    expect(formatViews(1249)).toBe("1.2k");
    expect(formatViews(9999)).toBe("9.9k");
  });

  it("drops the decimal once it stops carrying information", () => {
    expect(formatViews(10_000)).toBe("10k");
    expect(formatViews(123_456)).toBe("123k");
  });

  it("goes on to millions rather than printing 1234k", () => {
    expect(formatViews(1_000_000)).toBe("1m");
    expect(formatViews(1_250_000)).toBe("1.2m");
  });
});

describe("viewsLabel", () => {
  it("counts one view in the singular", () => {
    expect(viewsLabel(1)).toBe("1 view");
    expect(viewsLabel(0)).toBe("0 views");
    expect(viewsLabel(2)).toBe("2 views");
    expect(viewsLabel(1500)).toBe("1.5k views");
  });
});
