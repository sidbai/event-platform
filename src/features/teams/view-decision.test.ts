import { describe, expect, it } from "vitest";

import { teamViewDecision } from "./view-decision";

describe("teamViewDecision", () => {
  it("lets anyone see a public team", () => {
    expect(
      teamViewDecision({ visibility: "public", originEventId: null }, false),
    ).toBe("allow");
  });

  it("lets anyone see a team created for an event, because those are listed now", () => {
    expect(
      teamViewDecision({ visibility: "public", originEventId: "evt-1" }, false),
    ).toBe("allow");
  });

  it("makes a private team members-only however it was created", () => {
    // The create form promises "only people you invite will see it", and an
    // imported team turned private by its owner made the same promise. Being
    // born in a tournament used to override that.
    expect(
      teamViewDecision({ visibility: "private", originEventId: null }, false),
    ).toBe("check-member");
    expect(
      teamViewDecision({ visibility: "private", originEventId: "evt-1" }, false),
    ).toBe("check-member");
  });

  it("always lets admins in", () => {
    expect(
      teamViewDecision({ visibility: "private", originEventId: null }, true),
    ).toBe("allow");
  });
});
