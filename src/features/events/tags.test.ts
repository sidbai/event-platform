import { describe, expect, it } from "vitest";

import { eventTags } from "./tags";

const labels = (e: Parameters<typeof eventTags>[0], now?: Date) =>
  eventTags(e, now).map((t) => t.label);

describe("eventTags", () => {
  const NOW = new Date("2026-09-10T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const on = (days: number) => new Date(NOW.getTime() + days * DAY);

  it("leads with where the event is in its life", () => {
    /*
     * Ahead of even what kind of thing it is. A finished tournament and one
     * starting on Saturday are different things to a reader before the
     * difference between a tournament and a jamboree matters.
     */
    expect(
      labels({ kind: "tournament", startsAt: on(-1), endsAt: on(1) }, NOW)[0],
    ).toBe("Ongoing");
  });

  it("leads with the kind when there is no life to report", () => {
    // An undated pickup game has nothing to say about upcoming or finished.
    expect(labels({ kind: "pickup" })[0]).toBe("Pickup");
  });

  it("keeps the whole row in one order", () => {
    expect(
      labels(
        {
          kind: "tournament",
          startsAt: on(3),
          endsAt: on(5),
          sourceName: "Starfire Sports",
          ageGroup: "U12",
        },
        NOW,
      ),
    ).toEqual(["Upcoming", "Tournament", "External", "U12"]);
  });

  it("humanises hyphenated kinds", () => {
    expect(labels({ kind: "watch-party" })[0]).toBe("Watch party");
  });

  it("skips fields that carry no information", () => {
    // empty strings come back from optional form inputs, not just nulls
    expect(
      labels({ kind: "game", ageGroup: "", gender: null, format: "", level: null }),
    ).toEqual(["Game"]);
  });

  it("drops a coed gender as the assumed default, keeps the others", () => {
    expect(labels({ kind: "game", gender: "coed" })).toEqual(["Game"]);
    expect(labels({ kind: "game", gender: "girls" })).toContain("Girls");
    expect(labels({ kind: "game", gender: "BOYS" })).toContain("Boys");
  });

  it("shows the descriptive detail in a scannable order", () => {
    expect(
      labels({
        kind: "scrimmage",
        hostTeam: { name: "Marymoor United" },
        ageGroup: "U12",
        gender: "girls",
        format: "7v7",
        level: "select",
      }),
    ).toEqual(["Scrimmage", "Marymoor United", "U12", "Girls", "7v7", "Select"]);
  });

  it("flags an event looking for an opponent", () => {
    const tags = eventTags({ kind: "scrimmage", needsOpponent: true });
    expect(tags.find((t) => t.label === "Looking for opponent")?.tone).toBe("warn");
  });

  it("marks non-public events, but never public ones", () => {
    expect(labels({ kind: "custom", visibility: "private" })).toContain("Private");
    expect(labels({ kind: "custom", visibility: "public" })).not.toContain("Public");
  });

  it("says where an event is in its own life", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const at = (days: number) => new Date(now.getTime() + days * day);

    expect(
      labels({ kind: "tournament", startsAt: at(5), endsAt: at(7) }, now),
    ).toContain("Upcoming");
    expect(
      labels({ kind: "tournament", startsAt: at(-1), endsAt: at(1) }, now),
    ).toContain("Ongoing");
    expect(
      labels({ kind: "tournament", startsAt: at(-7), endsAt: at(-5) }, now),
    ).toContain("Completed");
  });

  it("lets the organizer's mark outrank the calendar", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    expect(
      labels(
        {
          kind: "tournament",
          status: "completed",
          startsAt: new Date(now.getTime() - day),
          endsAt: new Date(now.getTime() + day),
        },
        now,
      ),
    ).toContain("Completed");
  });

  it("says nothing about the life of a cancelled or unscheduled event", () => {
    // Cancelled did not finish, it did not happen; and an undated scrimmage
    // is not upcoming, it is unscheduled.
    expect(labels({ kind: "game", status: "cancelled" })).not.toContain("Completed");
    expect(labels({ kind: "game", status: "published" })).toEqual(["Game"]);
  });

  it("gives every tag an emoji", () => {
    const tags = eventTags({
      kind: "tournament",
      ageGroup: "U12",
      gender: "girls",
      format: "7v7",
      level: "select",
      needsOpponent: true,
      status: "completed",
      visibility: "private",
      hostTeam: { name: "Marymoor United" },
    });
    expect(tags.every((t) => t.emoji.length > 0)).toBe(true);
  });

  it("falls back to a generic emoji for an unknown kind", () => {
    // event_kinds is an editable table, so a kind can exist with no mapping
    expect(eventTags({ kind: "brand-new-kind" })[0].emoji).toBeTruthy();
  });

  it("produces unique labels, since they are used as React keys", () => {
    const tags = eventTags({
      kind: "game",
      ageGroup: "U12",
      format: "7v7",
      level: "rec",
      gender: "boys",
      needsOpponent: true,
      status: "completed",
      visibility: "unlisted",
      hostTeam: { name: "Marymoor United" },
    });
    expect(new Set(tags.map((t) => t.label)).size).toBe(tags.length);
  });
});

describe("the external tag", () => {
  const listed = { kind: "tournament", sourceName: "Starfire Sports" };

  it("marks an event run by someone else", () => {
    const labels = eventTags(listed).map((t) => t.label);
    expect(labels).toContain("External");
  });

  it("says nothing on an event we run", () => {
    expect(eventTags({ kind: "tournament" }).map((t) => t.label)).not.toContain(
      "External",
    );
  });

  it("comes straight after what kind of thing it is", () => {
    // Whether entries happen here or on somebody else's site decides what a
    // reader can do, so it outranks the age group and the format.
    const tags = eventTags({ ...listed, ageGroup: "U9–U19", format: "7v7" });
    expect(tags[0].label).toBe("Tournament");
    expect(tags[1].label).toBe("External");
  });

  it("is drawn, not filled, because it is a different kind of fact", () => {
    const tag = eventTags(listed).find((t) => t.label === "External");
    expect(tag?.tone).toBe("outline");
  });
});
