import { describe, expect, it } from "vitest";

import { teamViewDecision } from "./view-decision";

describe("teamViewDecision", () => {
  it("lets anyone see a public team", () => {
    expect(
      teamViewDecision({ visibility: "public", originEventId: null }, false),
    ).toBe("allow");
  });

  it("keeps tournament teams open", () => {
    // These are 'private' only to stay out of the directory. Public standings
    // link straight to them, so locking them would break the event page.
    expect(
      teamViewDecision({ visibility: "private", originEventId: "evt-1" }, false),
    ).toBe("allow");
  });

  it("makes a person's private team members-only", () => {
    // The create form promises "only people you invite will see it".
    expect(
      teamViewDecision({ visibility: "private", originEventId: null }, false),
    ).toBe("check-member");
  });

  it("always lets admins in", () => {
    expect(
      teamViewDecision({ visibility: "private", originEventId: null }, true),
    ).toBe("allow");
  });
});
