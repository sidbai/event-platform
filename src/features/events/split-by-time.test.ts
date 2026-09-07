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

  it("counts an event starting exactly now as ongoing", () => {
    // The whistle has gone. Somebody looking for what to do this afternoon
    // should not have to read past everything starting next month to find it.
    const { ongoing, upcoming } = splitByTime([at(now.toISOString())], now);
    expect(ongoing).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });

  it("loses nothing", () => {
    // Every event lands in exactly one of the four sections. The page shows
    // all four, so anything falling between them would simply disappear.
    const all = [at("2020-01-01T00:00:00Z"), at(null), at("2027-01-01T00:00:00Z")];
    const { upcoming, past, future } = splitByTime(all, now);
    expect(upcoming.length + past.length + future.length).toBe(all.length);
    const ids = [...upcoming, ...past, ...future];
    expect(new Set(ids).size).toBe(all.length);
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
    const { ongoing, past } = splitByTime(
      [span("2026-08-01T16:00:00Z", "2027-03-14T23:00:00Z")],
      now,
    );
    expect(ongoing).toHaveLength(1);
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

describe("splitByTime with a far-future section", () => {
  const span = (start: string, end: string | null) => ({
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  });
  const inDays = (n: number) =>
    new Date(now.getTime() + n * 86_400_000).toISOString();

  it("separates what is worth planning from what is worth browsing", () => {
    const soon = span(inDays(3), inDays(4));
    const far = span(inDays(150), inDays(152));
    const { upcoming, future, past } = splitByTime([far, soon], now);

    expect(upcoming).toEqual([soon]);
    expect(future).toEqual([far]);
    expect(past).toEqual([]);
  });

  it("keeps a season that is being played out of the far section", () => {
    // It started already, so it is happening now whatever its end date says —
    // and "Later on" is for things to browse, not things underway.
    const season = span(inDays(-20), inDays(160));
    const { ongoing, future } = splitByTime([season], now);
    expect(ongoing).toEqual([season]);
    expect(future).toEqual([]);
  });

  it("orders the far ones soonest first, like a calendar", () => {
    const march = span(inDays(180), null);
    const january = span(inDays(120), null);
    expect(splitByTime([march, january], now).future).toEqual([january, march]);
  });

  it("never files a date-less event under next year", () => {
    // Nobody knows when it is, so it belongs with the things still to be
    // sorted out rather than with January.
    const tbd = { startsAt: null, endsAt: null };
    const { upcoming, future } = splitByTime([tbd], now);
    expect(upcoming).toEqual([tbd]);
    expect(future).toEqual([]);
  });

  it("takes a different horizon when asked", () => {
    const event = span(inDays(90), null);
    expect(splitByTime([event], now).future).toHaveLength(1);
    expect(splitByTime([event], now, 120).upcoming).toHaveLength(1);
  });
});

describe("the ongoing section", () => {
  const span = (start: string, end: string | null) => ({
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  });
  const inDays = (n: number) =>
    new Date(now.getTime() + n * 86_400_000).toISOString();

  it("holds what is being played, and nothing else", () => {
    const live = span(inDays(-1), inDays(1));
    const soon = span(inDays(3), inDays(4));
    const done = span(inDays(-9), inDays(-8));
    const far = span(inDays(200), null);

    const out = splitByTime([live, soon, done, far], now);
    expect(out.ongoing).toEqual([live]);
    expect(out.upcoming).toEqual([soon]);
    expect(out.past).toEqual([done]);
    expect(out.future).toEqual([far]);
  });

  it("gives a one-day event with no end time the rest of its day", () => {
    /*
     * The disagreement this section exposed. A pickup game at six o'clock
     * counted as over the moment it kicked off, while its chip said Ongoing —
     * the same event reading "Ongoing" from inside the Past section. Both
     * sides now ask endOf.
     */
    const kickedOffAnHourAgo = span(inDays(-1 / 24), null);
    const out = splitByTime([kickedOffAnHourAgo], now);
    expect(out.ongoing).toEqual([kickedOffAnHourAgo]);
    expect(out.past).toEqual([]);
  });

  it("never calls a dateless event ongoing", () => {
    // Nobody knows when it is, so it waits with the upcoming ones rather than
    // claiming to be live.
    const undated = { startsAt: null, endsAt: null };
    const out = splitByTime([undated], now);
    expect(out.ongoing).toEqual([]);
    expect(out.upcoming).toEqual([undated]);
  });
});
