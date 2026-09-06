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

describe("splitByTime with an end date", () => {
  const span = (start: string, end: string | null) => ({
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  });

  it("keeps a season that is being played out of the past", () => {
    // The case this exists for: a league that kicked off in August and runs
    // to March was filed under "already happened" from its second day.
    const { upcoming, past } = splitByTime(
      [span("2026-08-01T16:00:00Z", "2027-03-14T23:00:00Z")],
      now,
    );
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("moves it to the past once it has finished", () => {
    const { upcoming, past } = splitByTime(
      [span("2025-09-01T16:00:00Z", "2026-03-14T23:00:00Z")],
      now,
    );
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("still keys on the start when there is no end", () => {
    const { past } = splitByTime([span("2026-09-04T10:00:00Z", null)], now);
    expect(past).toHaveLength(1);
  });

  it("sorts upcoming by when they start, not when they finish", () => {
    // A season starting tomorrow and ending in March comes before a one-day
    // tournament next month, even though it finishes long after.
    const { upcoming } = splitByTime(
      [
        span("2026-10-03T16:00:00Z", "2026-10-03T23:00:00Z"),
        span("2026-09-06T16:00:00Z", "2027-03-14T23:00:00Z"),
      ],
      now,
    );
    expect(upcoming[0].startsAt.toISOString()).toBe("2026-09-06T16:00:00.000Z");
  });
});
