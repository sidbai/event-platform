import { describe, expect, it } from "vitest";

import {
  canDecide,
  canRequest,
  canWithdraw,
  collisions,
  overlaps,
  slotErrors,
  slotState,
  spotsLeft,
  type Booking,
  type Slot,
} from "./slots";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-10T12:00:00Z");

const slot = (over: Partial<Slot> = {}): Slot => ({
  id: "s1",
  coachId: "ej",
  startsAt: at("2026-09-13T21:30:00Z"), // Sun 2:30 pm Pacific
  endsAt: at("2026-09-13T22:30:00Z"),
  capacity: 1,
  cancelledAt: null,
  ...over,
});

let n = 0;
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: `b${++n}`,
  sessionId: "s1",
  bookedBy: "hu",
  playerName: "Joshua",
  status: "requested",
  ...over,
});

describe("spotsLeft", () => {
  it("counts a request against the room, not only a confirmation", () => {
    // Three requests for a two-player slot is a problem to sort out, not
    // five open seats to advertise.
    expect(spotsLeft({ capacity: 2 }, [booking(), booking({ bookedBy: "li", playerName: "Ava" })])).toBe(0);
  });

  it("gives a declined seat back", () => {
    expect(spotsLeft({ capacity: 1 }, [booking({ status: "declined" })])).toBe(1);
  });

  it("never goes below zero", () => {
    expect(spotsLeft({ capacity: 1 }, [booking(), booking({ bookedBy: "li" })])).toBe(0);
  });
});

describe("canRequest", () => {
  it("lets a parent ask for an open slot", () => {
    expect(canRequest("hu", slot(), [], "Joshua", NOW)).toEqual({ ok: true });
  });

  it("refuses the coach their own slot", () => {
    expect(canRequest("ej", slot(), [], "Joshua", NOW)).toMatchObject({ reason: "own-slot" });
  });

  it("refuses a slot already asked for, for the same child, whatever the case", () => {
    expect(canRequest("hu", slot({ capacity: 4 }), [booking()], "joshua ", NOW)).toMatchObject({
      reason: "already-asked",
    });
  });

  it("lets the same parent ask again for a second child", () => {
    expect(canRequest("hu", slot({ capacity: 4 }), [booking()], "Ava", NOW)).toEqual({ ok: true });
  });

  it("refuses a full slot, a cancelled one and one that has started", () => {
    expect(canRequest("li", slot(), [booking()], "Ava", NOW)).toMatchObject({ reason: "full" });
    expect(canRequest("li", slot({ cancelledAt: NOW }), [], "Ava", NOW)).toMatchObject({
      reason: "cancelled",
    });
    expect(canRequest("li", slot(), [], "Ava", at("2026-09-13T21:30:00Z"))).toMatchObject({
      reason: "past",
    });
  });

  it("refuses somebody signed out before anything else", () => {
    expect(canRequest(null, slot({ cancelledAt: NOW }), [], "Ava", NOW)).toMatchObject({
      reason: "signed-out",
    });
  });
});

describe("canDecide / canWithdraw", () => {
  it("only the coach decides, and only a request", () => {
    expect(canDecide("ej", slot(), booking())).toBe(true);
    expect(canDecide("hu", slot(), booking())).toBe(false);
    expect(canDecide("ej", slot(), booking({ status: "confirmed" }))).toBe(false);
  });

  it("a parent withdraws their own, confirmed or not, but not a declined one", () => {
    expect(canWithdraw("hu", booking())).toBe(true);
    expect(canWithdraw("hu", booking({ status: "confirmed" }))).toBe(true);
    expect(canWithdraw("hu", booking({ status: "declined" }))).toBe(false);
    expect(canWithdraw("ej", booking())).toBe(false);
  });
});

describe("overlaps / collisions", () => {
  it("a slot ending at three and one starting at three do not collide", () => {
    const a = slot({ startsAt: at("2026-09-13T21:00:00Z"), endsAt: at("2026-09-13T22:00:00Z") });
    const b = slot({ id: "s2", startsAt: at("2026-09-13T22:00:00Z"), endsAt: at("2026-09-13T23:00:00Z") });
    expect(overlaps(a, b)).toBe(false);
    expect(collisions([a, b]).size).toBe(0);
  });

  it("flags both halves of the two o'clock entered twice", () => {
    const a = slot();
    const b = slot({ id: "s2", startsAt: at("2026-09-13T21:45:00Z"), endsAt: at("2026-09-13T22:45:00Z") });
    expect([...collisions([a, b])].sort()).toEqual(["s1", "s2"]);
  });

  it("ignores a cancelled slot and another coach's", () => {
    const a = slot();
    expect(collisions([a, slot({ id: "s2", cancelledAt: NOW })]).size).toBe(0);
    expect(collisions([a, slot({ id: "s2", coachId: "other" })]).size).toBe(0);
  });
});

describe("slotState", () => {
  it("puts a waiting request ahead of everything but cancellation", () => {
    expect(slotState(slot(), [booking()], NOW)).toBe("requested");
    // Full, but a request still needs an answer — even if the answer is no.
    expect(
      slotState(slot(), [booking({ status: "confirmed" }), booking({ bookedBy: "li" })], NOW),
    ).toBe("requested");
  });

  it("is full only when every seat is confirmed", () => {
    expect(slotState(slot(), [booking({ status: "confirmed" })], NOW)).toBe("full");
    expect(slotState(slot({ capacity: 2 }), [booking({ status: "confirmed" })], NOW)).toBe("open");
  });

  it("is past once it has ended, and cancelled over everything", () => {
    expect(slotState(slot(), [], at("2026-09-14T00:00:00Z"))).toBe("past");
    expect(slotState(slot({ cancelledAt: NOW }), [booking()], NOW)).toBe("cancelled");
  });
});

describe("slotErrors", () => {
  const good = {
    startsAt: at("2026-09-13T21:30:00Z"),
    endsAt: at("2026-09-13T22:30:00Z"),
    location: "Evergreen Playfield",
    capacity: 1,
    birthYearFrom: 2015,
    birthYearTo: 2017,
  };

  it("passes a sensible slot", () => {
    expect(slotErrors(good)).toEqual({});
  });

  it("names the field each problem is in", () => {
    expect(slotErrors({ ...good, endsAt: good.startsAt })).toHaveProperty("endsAt");
    expect(slotErrors({ ...good, location: " " })).toHaveProperty("location");
    expect(slotErrors({ ...good, capacity: 0 })).toHaveProperty("capacity");
    expect(slotErrors({ ...good, birthYearFrom: 2017, birthYearTo: 2015 })).toHaveProperty("birthYears");
  });

  it("suspects a seven-hour slot is an afternoon typed as one", () => {
    expect(slotErrors({ ...good, endsAt: at("2026-09-14T05:00:00Z") }).endsAt).toMatch(/several/);
  });

  it("allows open birth years", () => {
    expect(slotErrors({ ...good, birthYearFrom: null, birthYearTo: null })).toEqual({});
  });
});
