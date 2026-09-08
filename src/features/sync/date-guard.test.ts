import { describe, expect, it } from "vitest";

import { datesLookWrong, mismatchMessage } from "./date-guard";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** The June tournament that took September's fixtures. */
const springClassic = { startsAt: utc("2026-06-12"), endsAt: utc("2026-06-14") };

describe("datesLookWrong", () => {
  it("catches the paste that actually happened", () => {
    const wrong = datesLookWrong(
      ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"],
      springClassic,
    );
    expect(wrong).toEqual({
      from: "2026-09-04",
      to: "2026-09-07",
      eventFrom: "2026-06-12",
      eventTo: "2026-06-14",
      days: 82,
    });
  });

  it("says nothing about the event's own schedule", () => {
    expect(
      datesLookWrong(["2026-06-12", "2026-06-13", "2026-06-14"], springClassic),
    ).toBeNull();
  });

  it("allows a schedule that only overlaps", () => {
    // A flight added on the Thursday, pasted with the rest of the weekend.
    expect(
      datesLookWrong(["2026-06-11", "2026-06-12", "2026-06-13"], springClassic),
    ).toBeNull();
  });

  it("allows a week either side, because listings round their dates", () => {
    expect(datesLookWrong(["2026-06-19", "2026-06-21"], springClassic)).toBeNull();
    expect(datesLookWrong(["2026-06-05"], springClassic)).toBeNull();
    expect(datesLookWrong(["2026-06-22"], springClassic)).not.toBeNull();
  });

  it("treats an event with no end date as one day, plus the grace", () => {
    const oneDay = { startsAt: utc("2026-06-12"), endsAt: null };
    expect(datesLookWrong(["2026-06-13", "2026-06-14"], oneDay)).toBeNull();
    expect(datesLookWrong(["2026-09-05"], oneDay)).not.toBeNull();
  });

  it("cannot check what it does not know", () => {
    // No dates on the event, no dates in the paste: refusing either would be
    // a guess, and a guess here is a tick-box people learn to tick.
    expect(datesLookWrong(["2026-09-05"], { startsAt: null, endsAt: null })).toBeNull();
    expect(datesLookWrong([null, null], springClassic)).toBeNull();
    expect(datesLookWrong([], springClassic)).toBeNull();
  });

  it("ignores an end date that falls before the start", () => {
    const backwards = { startsAt: utc("2026-06-12"), endsAt: utc("2026-05-01") };
    expect(datesLookWrong(["2026-06-13"], backwards)).toBeNull();
  });

  it("takes a grace of its caller's choosing", () => {
    expect(datesLookWrong(["2026-06-16"], springClassic, 0)).not.toBeNull();
    expect(datesLookWrong(["2026-09-05"], springClassic, 365)).toBeNull();
  });
});

describe("mismatchMessage", () => {
  it("names both ranges and how far apart they are", () => {
    const wrong = datesLookWrong(["2026-09-04", "2026-09-07"], springClassic);
    expect(mismatchMessage(wrong!)).toContain("2026-09-04 to 2026-09-07");
    expect(mismatchMessage(wrong!)).toContain("2026-06-12 to 2026-06-14");
    expect(mismatchMessage(wrong!)).toContain("82 days apart");
  });

  it("prints a single day once", () => {
    const wrong = datesLookWrong(["2026-09-05"], { startsAt: utc("2026-06-12"), endsAt: null });
    expect(mismatchMessage(wrong!)).toContain("dated 2026-09-05, and this event runs 2026-06-12");
  });
});
