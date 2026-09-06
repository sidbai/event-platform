import { describe, expect, it } from "vitest";

import { formatFee, opennessOf, type Division, describeOpenness, type Openness } from "./openness";

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

describe("describeOpenness", () => {
  const open = (spotsLeft: number | null): Openness => ({ open: true, spotsLeft });

  it("says how many places are left, and when they go", () => {
    expect(describeOpenness(open(2), 6, { closes: "Sep 30, 2026" })).toBe(
      "2 places left · closes Sep 30, 2026",
    );
  });

  it("counts one place in the singular", () => {
    expect(describeOpenness(open(1), 7)).toBe("1 place left");
  });

  it("says only that it is open when there is no cap", () => {
    // A count of places with no capacity would be a number invented to fill
    // the sentence.
    expect(describeOpenness(open(null), 3)).toBe("Open for entries");
  });

  it("names the date entries open, or says soon", () => {
    const notYet: Openness = { open: false, reason: "not-yet", spotsLeft: null };
    expect(describeOpenness(notYet, 0, { opens: "Jun 1, 2026" })).toBe(
      "Entries open Jun 1, 2026",
    );
    expect(describeOpenness(notYet, 0)).toBe("Entries open soon");
  });

  it("says how full a full division is", () => {
    const full: Openness = { open: false, reason: "full", spotsLeft: 0 };
    expect(describeOpenness(full, 8)).toBe("Full — 8 teams entered");
    expect(describeOpenness(full, 1)).toBe("Full — 1 team entered");
  });

  it("names the closing date when there is one", () => {
    const closed: Openness = { open: false, reason: "closed", spotsLeft: 0 };
    expect(describeOpenness(closed, 4, { closes: "Aug 28, 2026" })).toBe(
      "Entries closed Aug 28, 2026",
    );
    expect(describeOpenness(closed, 4)).toBe("Entries closed");
  });
});
