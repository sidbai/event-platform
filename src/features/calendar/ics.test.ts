import { describe, expect, it } from "vitest";

import { calendar, fold, type CalendarEntry, type CalendarFixture } from "./ics";

const PT = "America/Los_Angeles";
const NOW = new Date("2026-09-10T12:00:00Z");

const fixture = (over: Partial<CalendarFixture> = {}): CalendarFixture => ({
  id: "719444",
  kickoffAt: new Date("2026-09-12T16:00:00Z"),
  timed: true,
  home: "PacNW SC B18/19 Maroon A",
  away: "XF B18/19 RCL 1",
  where: "Field 11N · Starfire Complex",
  event: "RCL",
  division: "BU08",
  url: "https://kingjuansoccer.com/events/rcl",
  ...over,
});

const ics = (fixtures: CalendarFixture[]) =>
  calendar(fixtures, { name: "RCL", timeZone: PT, now: NOW });

describe("calendar", () => {
  it("writes a fixture somebody's phone will draw at the right hour", () => {
    const out = ics([fixture()]);
    expect(out).toContain("DTSTART:20260912T160000Z");
    expect(out).toContain("DTEND:20260912T170000Z");
    expect(out).toContain("SUMMARY:PacNW SC B18/19 Maroon A v XF B18/19 RCL 1");
  });

  it("makes a whole day of a fixture whose hour nobody has published", () => {
    /*
     * Most of a league's season looks like this before the fields are booked.
     * Midnight is how the database says it; a calendar says it with a
     * whole-day event, and a phone drawing 12:00 AM would be stating a
     * kick-off nobody published.
     */
    const out = ics([fixture({ timed: false, kickoffAt: new Date("2026-09-19T07:00:00Z") })]);
    expect(out).toContain("DTSTART;VALUE=DATE:20260919");
    expect(out).toContain("DTEND;VALUE=DATE:20260920");
    expect(out).not.toMatch(/DTSTART:\d{8}T/);
    expect(out).toContain("Kick-off time not published yet");
  });

  it("keeps the day the fixture is on where the zone would move it", () => {
    // 7am UTC on the 19th is still the evening of the 18th in Seattle, and a
    // whole-day event has to be the day the game is on there.
    const out = ics([fixture({ timed: false, kickoffAt: new Date("2026-09-19T03:00:00Z") })]);
    expect(out).toContain("DTSTART;VALUE=DATE:20260918");
  });

  it("escapes what would otherwise end a line early", () => {
    // "Eastside FC, West" — the rest becomes a property the reader does not
    // know, and it drops the event or the whole feed.
    const out = ics([fixture({ home: "Eastside FC, West", where: "Field 1; gate B" })]);
    expect(out).toContain("SUMMARY:Eastside FC\\, West v XF B18/19 RCL 1");
    expect(out).toContain("LOCATION:Field 1\; gate B");
  });

  it("gives a fixture the same id however it is rescheduled", () => {
    // A reader matches on UID to know a game moved rather than a new one
    // appearing beside the old.
    const before = ics([fixture()]);
    const after = ics([fixture({ kickoffAt: new Date("2026-09-13T18:00:00Z") })]);
    const uid = (s: string) => s.match(/UID:(.+)/)![1];
    expect(uid(before)).toBe(uid(after));
  });

  it("has nothing to say about a fixture with no date", () => {
    expect(ics([fixture({ kickoffAt: null })])).not.toContain("BEGIN:VEVENT");
  });

  it("ends every line the way the format requires", () => {
    const out = ics([fixture()]);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out.split("\r\n").length).toBeGreaterThan(10);
    expect(out).not.toMatch(/[^\r]\n/);
  });
});

describe("an entry that is not a fixture", () => {
  const session: CalendarEntry = {
    id: "session-1",
    startsAt: new Date("2026-09-13T21:30:00Z"),
    endsAt: new Date("2026-09-13T22:30:00Z"),
    summary: "Training with EJ — Joshua",
    description: ["1-on-1", "https://kingjuansoccer.com/training/session-1"],
    location: "Evergreen Playfield",
    url: "https://kingjuansoccer.com/training/session-1",
  };

  it("writes the end the coach chose, not an assumed hour", () => {
    const out = calendar([session], { name: "Me", timeZone: PT, now: NOW });
    expect(out).toContain("DTSTART:20260913T213000Z");
    expect(out).toContain("DTEND:20260913T223000Z");
    expect(out).toContain("SUMMARY:Training with EJ — Joshua");
    expect(out).toContain("LOCATION:Evergreen Playfield");
  });

  it("sits beside a fixture in the same feed", () => {
    const out = calendar([fixture(), session], { name: "Me", timeZone: PT, now: NOW });
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out).toContain("UID:719444@kingjuansoccer.com");
    expect(out).toContain("UID:session-1@kingjuansoccer.com");
  });
});

describe("fold", () => {
  it("leaves a short line alone", () => {
    expect(fold("SUMMARY:Alpha v Beta")).toBe("SUMMARY:Alpha v Beta");
  });

  it("folds a long one, and the reader can put it back", () => {
    const line = "DESCRIPTION:" + "a".repeat(200);
    const folded = fold(line);
    expect(folded).toContain("\r\n ");
    expect(folded.split("\r\n").map((l) => l.replace(/^ /, "")).join("")).toBe(line);
  });

  it("counts octets, not characters", () => {
    /*
     * Two of the clubs here are written in Chinese, where one character is
     * three octets. Folding by character length would split one down the
     * middle and the reader would show a replacement box — or refuse the
     * feed.
     */
    const line = "SUMMARY:" + "喂饼".repeat(30);
    for (const piece of fold(line).split("\r\n")) {
      expect(Buffer.from(piece, "utf8").length).toBeLessThanOrEqual(76);
      expect(piece).not.toContain("�");
    }
    expect(fold(line).split("\r\n").map((l) => l.replace(/^ /, "")).join("")).toBe(line);
  });
});
