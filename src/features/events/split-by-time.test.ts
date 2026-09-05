import { describe, expect, it } from "vitest";

import { splitByTime } from "./split-by-time";

const now = new Date("2026-09-05T12:00:00Z");
const at = (iso: string | null) => ({ startsAt: iso ? new Date(iso) : null });

describe("splitByTime", () => {
  it("puts what you can still attend in upcoming", () => {
    const { upcoming, past } = splitByTime(
      [at("2026-09-06T10:00:00Z"), at("2026-09-04T10:00:00Z")],
      now,
    );
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(1);
  });

  it("orders upcoming soonest first", () => {
    const { upcoming } = splitByTime(
      [at("2026-12-01T00:00:00Z"), at("2026-09-10T00:00:00Z")],
      now,
    );
    expect(upcoming[0].startsAt?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("orders past most recent first", () => {
    const { past } = splitByTime(
      [at("2020-01-01T00:00:00Z"), at("2026-09-01T00:00:00Z")],
      now,
    );
    expect(past[0].startsAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("treats a date-less event as upcoming, not past", () => {
    // "Date TBD" has not happened as far as anyone knows — burying it under
    // finished events would hide the ones still being planned.
    const { upcoming, past } = splitByTime([at(null)], now);
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("counts an event starting exactly now as upcoming", () => {
    const { upcoming } = splitByTime([at(now.toISOString())], now);
    expect(upcoming).toHaveLength(1);
  });

  it("loses nothing", () => {
    const all = [at("2020-01-01T00:00:00Z"), at(null), at("2027-01-01T00:00:00Z")];
    const { upcoming, past } = splitByTime(all, now);
    expect(upcoming.length + past.length).toBe(all.length);
  });
});
