import { describe, expect, it } from "vitest";

import { eventTags } from "./tags";

const labels = (e: Parameters<typeof eventTags>[0]) =>
  eventTags(e).map((t) => t.label);

describe("eventTags", () => {
  it("always leads with the kind", () => {
    expect(labels({ kind: "pickup" })[0]).toBe("Pickup");
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

  it("notes completed and cancelled events", () => {
    expect(labels({ kind: "tournament", status: "completed" })).toContain(
      "Final results",
    );
    expect(labels({ kind: "game", status: "published" })).toEqual(["Game"]);
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
