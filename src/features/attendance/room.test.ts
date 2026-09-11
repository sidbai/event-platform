import { describe, expect, it } from "vitest";

import { roomFor } from "./room";

const going = (over: Partial<Parameters<typeof roomFor>[0]> = {}) =>
  roomFor({ status: "going", existing: null, capacity: 1, headcount: 0, mine: 0, guests: 0, ...over });

describe("roomFor", () => {
  it("lets the first person into a one-player slot, and not the second", () => {
    expect(going()).toBe(true);
    expect(going({ headcount: 1 })).toBe(false);
  });

  it("counts guests", () => {
    expect(going({ capacity: 4, headcount: 2, guests: 1 })).toBe(true);
    expect(going({ capacity: 4, headcount: 2, guests: 2 })).toBe(false);
  });

  it("does not count somebody already going against themselves", () => {
    // Changing a note on a full slot must not bounce the person who filled it.
    expect(going({ headcount: 1, existing: "going", mine: 1 })).toBe(true);
  });

  it("refuses a move up from maybe when full", () => {
    expect(going({ headcount: 1, existing: "maybe" })).toBe(false);
  });

  it("never refuses maybe, and never refuses without a capacity", () => {
    expect(roomFor({ status: "maybe", existing: null, capacity: 1, headcount: 5, mine: 0, guests: 0 })).toBe(true);
    expect(going({ capacity: null, headcount: 99 })).toBe(true);
  });
});
