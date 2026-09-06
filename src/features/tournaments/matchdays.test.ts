import { describe, expect, it } from "vitest";

import { byMatchday, currentMatchday, dayKey } from "./matchdays";

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
