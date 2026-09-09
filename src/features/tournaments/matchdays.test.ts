import { describe, expect, it } from "vitest";

import { byMatchday, byWeek, currentMatchday, currentWeek, dayKey, hasWeeks } from "./matchdays";

const SEATTLE = "America/Los_Angeles";
const m = (id: string, iso: string | null) => ({
  id,
  kickoffAt: iso ? new Date(iso) : null,
});

describe("dayKey", () => {
  it("uses the day where the match is played, not UTC", () => {
    // 7pm Sunday in Seattle is already Monday in UTC. Grouping in UTC would
    // file half a league's Sunday fixtures under Monday.
    expect(dayKey(new Date("2026-09-14T02:00:00Z"), SEATTLE)).toBe("2026-09-13");
    expect(dayKey(new Date("2026-09-14T02:00:00Z"), "UTC")).toBe("2026-09-14");
  });

  it("sorts as a string, which is why the format is what it is", () => {
    const a = dayKey(new Date("2026-09-09T18:00:00Z"), SEATTLE);
    const b = dayKey(new Date("2026-09-13T18:00:00Z"), SEATTLE);
    expect(a < b).toBe(true);
  });
});

describe("byMatchday", () => {
  it("groups by day and orders days earliest first", () => {
    const days = byMatchday(
      [
        m("late", "2026-09-19T17:00:00Z"),
        m("early", "2026-09-12T17:00:00Z"),
        m("mid", "2026-09-13T17:00:00Z"),
      ],
      SEATTLE,
    );
    expect(days.map((d) => d.key)).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-19",
    ]);
  });

  it("orders matches within a day by kickoff", () => {
    const days = byMatchday(
      [m("noon", "2026-09-12T19:00:00Z"), m("morning", "2026-09-12T17:00:00Z")],
      SEATTLE,
    );
    expect(days[0].matches.map((x) => x.id)).toEqual(["morning", "noon"]);
  });

  it("keeps unscheduled fixtures, at the end", () => {
    // A league that silently hid these would be missing rounds nobody could
    // account for.
    const days = byMatchday([m("tbd", null), m("set", "2026-09-12T17:00:00Z")], SEATTLE);
    expect(days.map((d) => d.key)).toEqual(["2026-09-12", ""]);
    expect(days[1].matches.map((x) => x.id)).toEqual(["tbd"]);
  });

  it("has nothing to group when there are no matches", () => {
    expect(byMatchday([], SEATTLE)).toEqual([]);
  });
});

describe("currentMatchday", () => {
  const days = byMatchday(
    [
      m("a", "2026-09-12T17:00:00Z"),
      m("b", "2026-09-19T17:00:00Z"),
      m("c", "2026-09-26T17:00:00Z"),
    ],
    SEATTLE,
  );

  it("lands on the next round still to come", () => {
    expect(currentMatchday(days, new Date("2026-09-15T12:00:00Z"), SEATTLE)).toBe(
      "2026-09-19",
    );
  });

  it("counts today as still to come", () => {
    expect(currentMatchday(days, new Date("2026-09-19T12:00:00Z"), SEATTLE)).toBe(
      "2026-09-19",
    );
  });

  it("falls back to the last round once the season is over", () => {
    expect(currentMatchday(days, new Date("2026-12-01T12:00:00Z"), SEATTLE)).toBe(
      "2026-09-26",
    );
  });

  it("copes with a schedule that is entirely unscheduled", () => {
    const tbd = byMatchday([m("x", null)], SEATTLE);
    expect(currentMatchday(tbd, new Date(), SEATTLE)).toBe("");
  });
});

/**
 * A league reads by round, not by date.
 *
 * The two are not the same list, and the cases where they come apart are the
 * ordinary ones: a round spread over a weekend, and a game postponed for
 * weather.
 */
describe("byWeek", () => {
  const at = (iso: string) => new Date(iso);
  const m = (id: string, week: number | null, iso: string | null) => ({
    id,
    week,
    kickoffAt: iso ? at(iso) : null,
  });

  it("keeps a round together when it is spread over a weekend", () => {
    // Grouped by date this is two matchdays; it is one round.
    const weeks = byWeek([
      m("sun", 3, "2026-09-13T20:00:00Z"),
      m("sat", 3, "2026-09-12T17:00:00Z"),
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].key).toBe("3");
    expect(weeks[0].matches.map((x) => x.id)).toEqual(["sat", "sun"]);
  });

  it("keeps a postponed game with the round it belongs to", () => {
    // Played a fortnight late, and still Week 2. By date it would turn up
    // alone under a heading in the middle of the season.
    const weeks = byWeek([
      m("on-time", 2, "2026-09-05T17:00:00Z"),
      m("rained-off", 2, "2026-09-19T17:00:00Z"),
      m("week-3", 3, "2026-09-12T17:00:00Z"),
    ]);
    expect(weeks.map((w) => w.key)).toEqual(["2", "3"]);
    expect(weeks[0].matches.map((x) => x.id)).toEqual(["on-time", "rained-off"]);
  });

  it("orders by number, which is not what a string sort does", () => {
    const weeks = byWeek([m("ten", 10, null), m("two", 2, null), m("one", 1, null)]);
    expect(weeks.map((w) => w.key)).toEqual(["1", "2", "10"]);
  });

  it("keeps fixtures with no round of their own, last", () => {
    // An imported league whose platform prints no round still has fixtures.
    const weeks = byWeek([m("unnumbered", null, "2026-09-05T17:00:00Z"), m("first", 1, null)]);
    expect(weeks.map((w) => w.key)).toEqual(["1", ""]);
  });
});

describe("hasWeeks", () => {
  it("is how the page decides which way to read a schedule", () => {
    expect(hasWeeks([{ id: "a", week: 1, kickoffAt: null }])).toBe(true);
    expect(hasWeeks([{ id: "a", week: null, kickoffAt: null }])).toBe(false);
    expect(hasWeeks([{ id: "a", kickoffAt: null }])).toBe(false);
  });
});

describe("currentWeek", () => {
  const at = (iso: string) => new Date(iso);
  const week = (key: string, iso: string | null) => ({
    key,
    matches: [{ id: key, week: Number(key), kickoffAt: iso ? at(iso) : null }],
  });

  it("opens on the round being played, not the one after it", () => {
    // Saturday evening, with Sunday's fixtures still to come.
    const now = at("2026-09-12T23:00:00Z");
    const weeks = [week("1", "2026-09-05T17:00:00Z"), week("2", "2026-09-12T17:00:00Z"), week("3", "2026-09-19T17:00:00Z")];
    expect(currentWeek(weeks, now)).toBe("2");
  });

  it("opens on the next round once the last one is done", () => {
    const now = at("2026-09-16T12:00:00Z");
    const weeks = [week("2", "2026-09-12T17:00:00Z"), week("3", "2026-09-19T17:00:00Z")];
    expect(currentWeek(weeks, now)).toBe("3");
  });

  it("goes by when a round is played, not by its number", () => {
    // Week 2 was rained off and is being played after Week 3. A reader wants
    // the football that is next.
    const now = at("2026-09-15T12:00:00Z");
    const weeks = [week("2", "2026-09-26T17:00:00Z"), week("3", "2026-09-19T17:00:00Z")];
    expect(currentWeek(weeks, now)).toBe("3");
  });

  it("stays on the last round once the season is over", () => {
    const now = at("2027-04-01T12:00:00Z");
    const weeks = [week("1", "2026-09-05T17:00:00Z"), week("2", "2026-09-12T17:00:00Z")];
    expect(currentWeek(weeks, now)).toBe("2");
  });

  it("falls back to the first when nothing has a date yet", () => {
    expect(currentWeek([week("1", null), week("2", null)], at("2026-09-12T12:00:00Z"))).toBe("1");
  });
});
