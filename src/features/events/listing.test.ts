import { describe, expect, it } from "vitest";

import {
  attributionOf,
  isExternalListing,
  isRunHere,
  safeSourceUrl,
  scheduleActionOf,
} from "./listing";

const native = { sourceName: null, sourceUrl: null };
const listed = {
  sourceName: "Washington Premier League",
  sourceUrl: "https://wpl-soccer.com/labor-day-cup",
};

describe("telling a listing from an event we run", () => {
  it("knows one from the other", () => {
    expect(isExternalListing(native)).toBe(false);
    expect(isExternalListing(listed)).toBe(true);
  });

  it("treats a claimed listing as ours to run", () => {
    // Claiming is exactly the act of taking it over, so ownership wins over
    // where the listing originally came from.
    expect(isRunHere({ ...listed, organizerId: "u1" })).toBe(true);
    expect(isRunHere(listed)).toBe(false);
    expect(isRunHere(native)).toBe(true);
  });
});

describe("attribution", () => {
  it("says whose event it is, and links back", () => {
    expect(attributionOf(listed)).toEqual({
      text: "Listed from Washington Premier League",
      href: "https://wpl-soccer.com/labor-day-cup",
    });
  });

  it("has nothing to attribute for an event we run", () => {
    expect(attributionOf(native)).toBeNull();
  });

  it("still names the source when there is no usable link", () => {
    // Saying whose event it is matters more than being able to link to it.
    // Dropping the credit because a URL was missing would be the wrong half
    // to lose.
    expect(attributionOf({ sourceName: "Rain City Cup", sourceUrl: null })).toEqual({
      text: "Listed from Rain City Cup",
      href: null,
    });
  });

  it("keeps attributing a claimed listing", () => {
    // Someone taking the event over does not change where it was found.
    expect(attributionOf({ ...listed, organizerId: "u1" })?.text).toBe(
      "Listed from Washington Premier League",
    );
  });
});

describe("safeSourceUrl", () => {
  it("passes an ordinary link through", () => {
    expect(safeSourceUrl("https://wpl-soccer.com/cup")).toBe(
      "https://wpl-soccer.com/cup",
    );
    expect(safeSourceUrl("  http://example.org/x  ")).toBe("http://example.org/x");
  });

  it("refuses anything that is not http", () => {
    // This field is the one place on the page where a stranger picks the
    // destination, and it is typed in by hand.
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:msgbox",
    ]) {
      expect(safeSourceUrl(bad)).toBeNull();
    }
  });

  it("refuses a relative path, which would point back at us", () => {
    expect(safeSourceUrl("/events/something")).toBeNull();
    expect(safeSourceUrl("wpl-soccer.com/cup")).toBeNull();
  });

  it("has nothing for nothing", () => {
    expect(safeSourceUrl(null)).toBeNull();
    expect(safeSourceUrl("")).toBeNull();
    expect(safeSourceUrl("   ")).toBeNull();
  });
});

describe("the schedule link", () => {
  const withSchedule = {
    sourceName: "Crossfire Premier Soccer",
    sourceUrl: "https://www.crossfiresoccer.org/tournaments/ldc/",
    scheduleUrl: "https://crossfire.athletes2events.com/events/130/groups",
  };

  it("points at wherever the organizer keeps the fixtures", () => {
    expect(scheduleActionOf(withSchedule)).toEqual({
      label: "Schedule & standings on Crossfire Premier Soccer",
      href: "https://crossfire.athletes2events.com/events/130/groups",
      external: true,
    });
  });

  it("says where the button goes, not what the reader hopes to find", () => {
    /*
     * The label carries the platform's name because the button leaves this
     * site. A synced listing shows the same fixtures further down the page,
     * so a bare "Schedule & standings" would read as navigation within it.
     */
    expect(scheduleActionOf(withSchedule)?.label).toBe(
      "Schedule & standings on Crossfire Premier Soccer",
    );
  });

  it("offers the event's own page when there is no schedule link", () => {
    /*
     * Four of the ten listings have no schedule URL. Their event page is
     * still where entries, times and late changes live — worth a button, as
     * long as it is not named for a table it does not have.
     */
    const action = scheduleActionOf({ ...withSchedule, scheduleUrl: null });
    expect(action).toEqual({
      label: "View on Crossfire Premier Soccer",
      href: "https://www.crossfiresoccer.org/tournaments/ldc/",
      external: true,
    });
  });


  it("has nothing to add for an event we run", () => {
    // Ours keeps its own schedule at /events/<slug>/table.
    expect(scheduleActionOf({ ...withSchedule, organizerId: "u1" })).toBeNull();
    expect(scheduleActionOf({ sourceName: null, sourceUrl: null })).toBeNull();
  });

  it("never calls the organizer's front page a schedule", () => {
    // A "Schedule & standings" link that lands somewhere you have to hunt is
    // a worse promise than no link, because it was believed. It may still be
    // offered — under its own name.
    for (const scheduleUrl of [null, ""]) {
      expect(scheduleActionOf({ ...withSchedule, scheduleUrl })?.label).toBe(
        "View on Crossfire Premier Soccer",
      );
    }
  });

  it("offers nothing when there is nowhere to send anybody", () => {
    expect(
      scheduleActionOf({ sourceName: "Starfire Sports", sourceUrl: null }),
    ).toBeNull();
  });

  it("refuses a schedule link that is not http", () => {
    // It falls back to the event's page rather than to the bad link, and
    // never to the bad link under a schedule's name.
    for (const bad of ["javascript:alert(1)", "/events/x"]) {
      expect(scheduleActionOf({ ...withSchedule, scheduleUrl: bad })?.href).toBe(
        "https://www.crossfiresoccer.org/tournaments/ldc/",
      );
    }
    expect(
      scheduleActionOf({
        sourceName: "WPL",
        sourceUrl: "javascript:alert(1)",
        scheduleUrl: "javascript:alert(1)",
      }),
    ).toBeNull();
  });
});

describe("what a pasted link carries with it", () => {
  it("drops the session of whoever copied it", () => {
    /*
     * The real one: an admin pasted an EventConnect schedule URL from their
     * own signed-in browser, and it arrived with registration_id=2253984 on
     * it. Stored as-is, every parent who pressed "Schedule & standings" went
     * to that platform carrying one person's identifier.
     */
    expect(
      safeSourceUrl(
        "https://app.eventconnect.io/events/42108/scheduling-scoring?page-view=schedule&nav=hidden&registration_id=2253984",
      ),
    ).toBe(
      "https://app.eventconnect.io/events/42108/scheduling-scoring?page-view=schedule&nav=hidden",
    );
  });

  it("drops the campaign tags a link picks up in transit", () => {
    expect(
      safeSourceUrl("https://example.test/t?utm_source=news&utm_medium=email&flight=3"),
    ).toBe("https://example.test/t?flight=3");
  });

  it("keeps the parameters the page actually needs", () => {
    // page-view and flight-id are how these platforms address a page at all;
    // stripping those would break the link this is trying to protect.
    expect(safeSourceUrl("https://crossfire.athletes2events.com/events/130/groups")).toBe(
      "https://crossfire.athletes2events.com/events/130/groups",
    );
    expect(
      safeSourceUrl("https://x.test/schedules?team-id=6997&flight-id=1123"),
    ).toBe("https://x.test/schedules?team-id=6997&flight-id=1123");
  });

  it("still refuses what it always refused", () => {
    expect(safeSourceUrl("javascript:alert(1)?utm_source=x")).toBeNull();
    expect(safeSourceUrl("/events/x")).toBeNull();
  });
});
