import { describe, expect, it } from "vitest";

import { formatFee, opennessOf, type Division } from "./openness";

const NOW = new Date("2026-09-06T12:00:00Z");
const div = (over: Partial<Division> = {}): Division => ({
  capacity: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  ...over,
});

describe("opennessOf", () => {
  it("is open with no window and no cap", () => {
    expect(opennessOf(div(), 0, NOW)).toEqual({ open: true, spotsLeft: null });
  });

  it("counts places left against the cap", () => {
    expect(opennessOf(div({ capacity: 12 }), 9, NOW)).toEqual({
      open: true,
      spotsLeft: 3,
    });
  });

  it("is full at the cap, and stays full past it", () => {
    expect(opennessOf(div({ capacity: 12 }), 12, NOW)).toEqual({
      open: false,
      reason: "full",
      spotsLeft: 0,
    });
    // Over-accepted by hand: still full, never a negative number on a page.
    expect(opennessOf(div({ capacity: 12 }), 15, NOW)).toEqual({
      open: false,
      reason: "full",
      spotsLeft: 0,
    });
  });

  it("has not opened yet before the window", () => {
    const d = div({ registrationOpensAt: new Date("2026-09-10T00:00:00Z") });
    expect(opennessOf(d, 0, NOW)).toEqual({
      open: false,
      reason: "not-yet",
      spotsLeft: null,
    });
  });

  it("is closed after the window", () => {
    const d = div({ registrationClosesAt: new Date("2026-09-01T00:00:00Z") });
    expect(opennessOf(d, 0, NOW)).toEqual({
      open: false,
      reason: "closed",
      spotsLeft: 0,
    });
  });

  it("is open inside the window", () => {
    const d = div({
      registrationOpensAt: new Date("2026-09-01T00:00:00Z"),
      registrationClosesAt: new Date("2026-09-30T00:00:00Z"),
    });
    expect(opennessOf(d, 0, NOW)).toEqual({ open: true, spotsLeft: null });
  });

  it("says closed rather than full when it is both", () => {
    // Telling a team it is full invites a question about a waitlist. The
    // window being over is the fact that actually answers them.
    const d = div({
      capacity: 8,
      registrationClosesAt: new Date("2026-09-01T00:00:00Z"),
    });
    expect(opennessOf(d, 8, NOW)).toMatchObject({ reason: "closed" });
  });

  it("treats the closing instant as still open", () => {
    const d = div({ registrationClosesAt: NOW });
    expect(opennessOf(d, 0, NOW).open).toBe(true);
  });
});

describe("formatFee", () => {
  it("says Free rather than $0", () => {
    expect(formatFee(null)).toBe("Free");
  });

  it("drops the cents when there are none", () => {
    expect(formatFee(79500)).toBe("$795");
  });

  it("keeps them when there are", () => {
    expect(formatFee(79550)).toBe("$795.50");
  });
});
