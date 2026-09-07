import { describe, expect, it } from "vitest";

import {
  canMarkCompleted,
  canReopen,
  completionSuggestion,
  endOf,
  hasFinished,
} from "./completion";

const now = new Date("2026-09-10T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

describe("endOf", () => {
  it("uses the end date when there is one", () => {
    expect(endOf({ startsAt: at(-3), endsAt: at(-1) })).toEqual(at(-1));
  });

  it("gives a one-day event the rest of its day", () => {
    // A tournament that starts at 9am is not over at 9:01.
    expect(endOf({ startsAt: at(-1), endsAt: null })).toEqual(at(0));
  });

  it("has no answer for an event with no dates", () => {
    expect(endOf({ startsAt: null, endsAt: null })).toBeNull();
  });
});

describe("hasFinished", () => {
  it("waits for the last day to be over", () => {
    expect(hasFinished({ startsAt: at(-3), endsAt: at(1) }, now)).toBe(false);
    expect(hasFinished({ startsAt: at(-3), endsAt: at(-1) }, now)).toBe(true);
  });

  it("is false while it is being played", () => {
    expect(hasFinished({ startsAt: at(-1), endsAt: at(2) }, now)).toBe(false);
  });

  it("never calls a dateless event finished", () => {
    // A meetup with no date is not over; it has not been scheduled.
    expect(hasFinished({ startsAt: null, endsAt: null }, now)).toBe(false);
  });
});

describe("who can be marked completed", () => {
  it("only one that is actually running", () => {
    expect(canMarkCompleted("published")).toBe(true);
    for (const s of ["draft", "pending", "cancelled", "completed"]) {
      expect(canMarkCompleted(s), s).toBe(false);
    }
  });

  it("refuses to complete a cancelled event", () => {
    // It did not finish — it did not happen, which the page already says.
    expect(canMarkCompleted("cancelled")).toBe(false);
  });

  it("can be undone, for the one marked a week early", () => {
    expect(canReopen("completed")).toBe(true);
    expect(canReopen("published")).toBe(false);
  });
});

describe("completionSuggestion", () => {
  const played = [{ homeScore: 1 }, { homeScore: 0 }];

  it("offers once the calendar says it is over", () => {
    // Nobody comes back on the Tuesday after to change a status.
    expect(
      completionSuggestion(
        { status: "published", startsAt: at(-5), endsAt: at(-3), fixtures: played },
        now,
      ),
    ).toEqual({ suggest: true, daysAgo: 3, unplayed: 0 });
  });

  it("says how many results are still missing", () => {
    // "Mark this finished" is the wrong thing to click with a dozen scores
    // unentered, so the page gets to say so.
    const out = completionSuggestion(
      {
        status: "published",
        startsAt: at(-5),
        endsAt: at(-3),
        fixtures: [...played, { homeScore: null }, { homeScore: null }],
      },
      now,
    );
    expect(out).toEqual({ suggest: true, daysAgo: 3, unplayed: 2 });
  });

  it("stays quiet while the event is still on", () => {
    expect(
      completionSuggestion(
        { status: "published", startsAt: at(-1), endsAt: at(1), fixtures: played },
        now,
      ),
    ).toEqual({ suggest: false });
  });

  it("stays quiet about one already marked, or cancelled", () => {
    for (const status of ["completed", "cancelled", "draft"]) {
      expect(
        completionSuggestion(
          { status, startsAt: at(-5), endsAt: at(-3), fixtures: played },
          now,
        ),
        status,
      ).toEqual({ suggest: false });
    }
  });
});
