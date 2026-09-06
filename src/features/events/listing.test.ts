import { describe, expect, it } from "vitest";

import {
  attributionOf,
  isExternalListing,
  isRunHere,
  primaryActionOf,
  safeSourceUrl,
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

describe("what the page offers", () => {
  it("sends a listing's visitors to the organizer", () => {
    expect(primaryActionOf(listed)).toEqual({
      label: "Details & registration",
      href: "https://wpl-soccer.com/labor-day-cup",
    });
  });

  it("leaves our own events to their own buttons", () => {
    expect(primaryActionOf(native)).toBeNull();
    expect(primaryActionOf({ ...listed, organizerId: "u1" })).toBeNull();
  });

  it("promises no destination it cannot reach", () => {
    // A listing with an unusable link is still a listing; it just does not
    // get a button that goes nowhere.
    expect(primaryActionOf({ sourceName: "Rain City Cup", sourceUrl: null })).toBeNull();
    expect(
      primaryActionOf({ sourceName: "Rain City Cup", sourceUrl: "javascript:alert(1)" }),
    ).toBeNull();
  });
});
