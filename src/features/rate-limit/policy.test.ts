import { describe, expect, it } from "vitest";

import {
  LIMITS,
  retryAfterLabel,
  retryAfterSeconds,
  windowStartFor,
  withinLimit,
  type Bucket,
} from "./policy";

describe("windowStartFor", () => {
  it("floors to the window, so everyone in it shares a counter", () => {
    const a = windowStartFor(new Date("2026-09-04T13:05:00Z"), 3600);
    const b = windowStartFor(new Date("2026-09-04T13:59:59Z"), 3600);
    expect(a.toISOString()).toBe("2026-09-04T13:00:00.000Z");
    expect(a.getTime()).toBe(b.getTime());
  });

  it("rolls over at the boundary", () => {
    const before = windowStartFor(new Date("2026-09-04T13:59:59Z"), 3600);
    const after = windowStartFor(new Date("2026-09-04T14:00:00Z"), 3600);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("is stable for day windows", () => {
    const d = windowStartFor(new Date("2026-09-04T23:59:59Z"), 86400);
    expect(d.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });
});

describe("withinLimit", () => {
  // The count is compared AFTER incrementing, so the Nth request is the last
  // allowed one — off by one here would either give a free extra or eat one.
  it("allows exactly the allowance", () => {
    expect(withinLimit(1, 5)).toBe(true);
    expect(withinLimit(5, 5)).toBe(true);
  });

  it("blocks the one past it", () => {
    expect(withinLimit(6, 5)).toBe(false);
  });
});

describe("retryAfterSeconds", () => {
  it("counts down to the window's end", () => {
    const start = new Date("2026-09-04T13:00:00Z");
    const now = new Date("2026-09-04T13:59:00Z");
    expect(retryAfterSeconds(now, start, 3600)).toBe(60);
  });

  it("never goes negative on a stale window", () => {
    const start = new Date("2026-09-04T13:00:00Z");
    const now = new Date("2026-09-04T15:00:00Z");
    expect(retryAfterSeconds(now, start, 3600)).toBe(0);
  });
});

describe("retryAfterLabel", () => {
  it("reads naturally at each scale", () => {
    expect(retryAfterLabel(30)).toBe("a minute");
    expect(retryAfterLabel(600)).toBe("10 minutes");
    expect(retryAfterLabel(3600)).toBe("an hour");
    expect(retryAfterLabel(7200)).toBe("2 hours");
    expect(retryAfterLabel(86400)).toBe("a day");
  });
});

describe("LIMITS", () => {
  const buckets = Object.keys(LIMITS) as Bucket[];

  it("gives every bucket a positive allowance and window", () => {
    for (const b of buckets) {
      expect(LIMITS[b].limit).toBeGreaterThan(0);
      expect(LIMITS[b].windowSeconds).toBeGreaterThan(0);
    }
  });

  it("says what happened, and leaves the timing to the caller", () => {
    // The wait is appended at call time from the real window, so a message
    // that also stated it would eventually contradict it.
    for (const b of buckets) {
      expect(LIMITS[b].message.length).toBeGreaterThan(20);
      expect(LIMITS[b].message).not.toMatch(/tomorrow|in an hour|few minutes/i);
    }
  });

  it("keeps community editing looser than reviewing", () => {
    // A bad edit is reversible through the history; a review is a person's
    // reputation, so it gets the tighter allowance.
    expect(LIMITS["entry:edit"].limit).toBeGreaterThan(LIMITS["review:create"].limit);
  });
});
