import { describe, expect, it } from "vitest";

import {
  eventFreshness,
  eventIsIndexable,
  teamIsIndexable,
  type ListedEvent,
} from "./sitemap-entries";

const now = new Date("2026-09-07T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * 86_400_000);
const event = (over: Partial<ListedEvent> = {}): ListedEvent => ({
  slug: "cup",
  updatedAt: now,
  status: "published",
  visibility: "public",
  startsAt: at(3),
  endsAt: at(5),
  ...over,
});

describe("eventIsIndexable", () => {
  it("lists what the events page lists", () => {
    expect(eventIsIndexable(event())).toBe(true);
    expect(eventIsIndexable(event({ status: "completed" }))).toBe(true);
  });

  it("never lists an unlisted event", () => {
    /*
     * Unlisted means reachable by link and never in a list. A sitemap is the
     * most emphatic list there is, so putting one in would undo the only
     * thing the setting means.
     */
    expect(eventIsIndexable(event({ visibility: "unlisted" }))).toBe(false);
    expect(eventIsIndexable(event({ visibility: "private" }))).toBe(false);
  });

  it("never lists one that is not approved or has been cancelled", () => {
    expect(eventIsIndexable(event({ status: "pending" }))).toBe(false);
    expect(eventIsIndexable(event({ status: "cancelled" }))).toBe(false);
    expect(eventIsIndexable(event({ status: "draft" }))).toBe(false);
  });
});

describe("teamIsIndexable", () => {
  const team = (over = {}) => ({
    slug: "xf-u12",
    updatedAt: now,
    visibility: "private",
    originEventId: "e1",
    ...over,
  });

  it("lists a team created for an event, private or not", () => {
    // teamViewDecision lets these through because public standings link to
    // them, and they are almost everything we hold.
    expect(teamIsIndexable(team())).toBe(true);
  });

  it("lists a public team", () => {
    expect(teamIsIndexable(team({ visibility: "public", originEventId: null }))).toBe(true);
  });

  it("keeps a private team nobody can reach out of it", () => {
    // A members-only team page 404s for a crawler, and a sitemap full of 404s
    // is worse than no sitemap.
    expect(teamIsIndexable(team({ visibility: "private", originEventId: null }))).toBe(
      false,
    );
  });
});

describe("eventFreshness", () => {
  it("asks a crawler back daily while the football is being played", () => {
    expect(eventFreshness(event({ startsAt: at(-1), endsAt: at(1) }), now)).toEqual({
      changeFrequency: "daily",
      priority: 0.9,
    });
  });

  it("is patient about one that has not started", () => {
    expect(eventFreshness(event(), now).changeFrequency).toBe("weekly");
  });

  it("stops asking about one that finished", () => {
    // A tournament from last summer will never change again, and crawl budget
    // spent on it is budget not spent on this weekend.
    expect(eventFreshness(event({ startsAt: at(-30), endsAt: at(-28) }), now)).toEqual({
      changeFrequency: "yearly",
      priority: 0.5,
    });
  });

  it("treats a one-day event as being played on its day", () => {
    expect(
      eventFreshness(event({ startsAt: at(-0.1), endsAt: null }), now).changeFrequency,
    ).toBe("daily");
  });
});
