import { describe, expect, it } from "vitest";

import { weekendRange } from "./dates";

describe("weekendRange", () => {
  it("from a Wednesday, points at the coming Sat→Mon", () => {
    const { start, end } = weekendRange(new Date("2026-09-02T14:00:00")); // Wed
    expect(start.getDay()).toBe(6); // Saturday
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(start.getHours()).toBe(0);
  });

  it("on a Saturday, uses that same day", () => {
    const { start } = weekendRange(new Date("2026-09-05T09:00:00"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("on a Sunday, still covers that day (start = yesterday Sat)", () => {
    const { start, end } = weekendRange(new Date("2026-09-06T09:00:00"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-07");
  });
});
