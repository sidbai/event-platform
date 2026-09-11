import { describe, expect, it } from "vitest";

import { whenLabel } from "./when-label";

// Friday 11 Sep 2026, 10:00 Pacific.
const NOW = new Date("2026-09-11T17:00:00Z");
const at = (iso: string) => new Date(iso);

describe("whenLabel", () => {
  it("says today and tomorrow", () => {
    expect(whenLabel(at("2026-09-11T21:30:00Z"), true, NOW)).toEqual({ day: "Today", time: "2:30 PM" });
    expect(whenLabel(at("2026-09-12T14:00:00Z"), true, NOW)).toEqual({ day: "Tomorrow", time: "7:00 AM" });
  });

  it("uses the weekday inside a week and the date beyond it", () => {
    expect(whenLabel(at("2026-09-13T21:30:00Z"), true, NOW).day).toBe("Sunday");
    expect(whenLabel(at("2026-09-17T21:30:00Z"), true, NOW).day).toBe("Thursday");
    expect(whenLabel(at("2026-09-18T21:30:00Z"), true, NOW).day).toBe("Fri, Sep 18");
  });

  it("counts days in the zone, not in UTC", () => {
    // 11 pm Friday Pacific is Saturday in UTC, and still "Today" here.
    expect(whenLabel(at("2026-09-12T06:00:00Z"), true, NOW).day).toBe("Today");
  });

  it("leaves the hour off when nobody published one", () => {
    expect(whenLabel(at("2026-09-13T07:00:00Z"), false, NOW)).toEqual({ day: "Sunday", time: null });
  });

  it("does not call the past today", () => {
    expect(whenLabel(at("2026-09-10T21:30:00Z"), true, NOW).day).toBe("Thu, Sep 10");
  });
});
