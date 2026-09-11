import { describe, expect, it } from "vitest";

import { addDays, localDate, spanLabel, week, weekStart, zonedInstant } from "./week";

const at = (iso: string) => new Date(iso);

describe("weekStart", () => {
  it("finds the Monday, in the zone", () => {
    // Sunday 2:30 pm Pacific, 13 Sep 2026.
    expect(weekStart(at("2026-09-13T21:30:00Z"))).toBe("2026-09-07");
    expect(weekStart(at("2026-09-07T08:00:00Z"))).toBe("2026-09-07");
  });

  it("keeps late Saturday Pacific in Saturday's week, though it is Sunday in UTC", () => {
    // 11 pm Saturday Pacific = 06:00 Sunday UTC. The wrong week, if done in UTC.
    expect(weekStart(at("2026-09-13T06:00:00Z"))).toBe("2026-09-07");
    expect(localDate(at("2026-09-13T06:00:00Z"))).toBe("2026-09-12");
  });
});

describe("week", () => {
  it("places each slot on the local day it starts, in order", () => {
    const days = week("2026-09-07", [
      { id: "b", startsAt: at("2026-09-13T22:30:00Z") },
      { id: "a", startsAt: at("2026-09-13T21:30:00Z") },
      { id: "sat-late", startsAt: at("2026-09-13T06:00:00Z") },
    ]);
    expect(days).toHaveLength(7);
    expect(days[6].date).toBe("2026-09-13");
    expect(days[6].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(days[5].items.map((i) => i.id)).toEqual(["sat-late"]);
  });

  it("drops what falls outside the week", () => {
    const days = week("2026-09-07", [{ id: "next", startsAt: at("2026-09-20T21:30:00Z") }]);
    expect(days.flatMap((d) => d.items)).toEqual([]);
  });

  it("labels the day", () => {
    expect(week("2026-09-07", [])[6].label).toBe("Sun 13 Sept");
  });
});

describe("zonedInstant", () => {
  it("reads a Pacific date and time as that instant", () => {
    // PDT is UTC-7 in September.
    expect(zonedInstant("2026-09-13", "14:30").toISOString()).toBe("2026-09-13T21:30:00.000Z");
  });

  it("is right on the other side of the clock change", () => {
    // PST is UTC-8 in January.
    expect(zonedInstant("2026-01-11", "14:30").toISOString()).toBe("2026-01-11T22:30:00.000Z");
  });

  it("round-trips through the local date", () => {
    expect(localDate(zonedInstant("2026-09-13", "23:45"))).toBe("2026-09-13");
  });
});

describe("labels", () => {
  it("writes a span once when both ends share the suffix", () => {
    expect(spanLabel(at("2026-09-13T21:30:00Z"), at("2026-09-13T22:30:00Z"))).toBe("2:30–3:30 pm");
    expect(spanLabel(at("2026-09-13T18:30:00Z"), at("2026-09-13T19:30:00Z"))).toBe("11:30 am–12:30 pm");
  });

  it("adds days as calendar days", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-09-07", -1)).toBe("2026-09-06");
  });
});
