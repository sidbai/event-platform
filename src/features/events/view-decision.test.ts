import { describe, expect, it } from "vitest";

import { viewDecision, type ViewableEvent } from "./view-decision";

const ORGANIZER = "org-1";
const OTHER = "user-2";

function event(over: Partial<ViewableEvent> = {}): ViewableEvent {
  return {
    id: "e1",
    status: "published",
    visibility: "public",
    organizerId: ORGANIZER,
    ...over,
  };
}

describe("viewDecision", () => {
  it("lets anyone see a published public event", () => {
    expect(viewDecision(event(), null, false)).toBe("allow");
    expect(viewDecision(event(), OTHER, false)).toBe("allow");
  });

  it("lets anyone with the link see an unlisted event", () => {
    // Unlisted means "not advertised", not "secret" — sharing the link is the
    // whole point, so a signed-out visitor must get through.
    const e = event({ visibility: "unlisted" });
    expect(viewDecision(e, null, false)).toBe("allow");
    expect(viewDecision(e, OTHER, false)).toBe("allow");
  });

  it("denies a private event to signed-out visitors without a query", () => {
    expect(viewDecision(event({ visibility: "private" }), null, false)).toBe(
      "deny",
    );
  });

  it("defers to the guest list / host team for a signed-in stranger", () => {
    expect(viewDecision(event({ visibility: "private" }), OTHER, false)).toBe(
      "check-access",
    );
  });

  it("always lets the organizer and admins in", () => {
    const e = event({ visibility: "private", status: "pending" });
    expect(viewDecision(e, ORGANIZER, false)).toBe("allow");
    expect(viewDecision(e, OTHER, true)).toBe("allow");
  });

  it("hides work in progress from everyone else, however visible", () => {
    for (const status of ["pending", "cancelled", "draft"]) {
      // public visibility must not rescue a non-published event
      expect(viewDecision(event({ status }), OTHER, false)).toBe("deny");
      expect(viewDecision(event({ status }), null, false)).toBe("deny");
    }
  });

  it("does not treat a null organizer as a match for a signed-out visitor", () => {
    // organizerId is nullable; `null === null` must not grant access.
    const e = event({ organizerId: null, visibility: "private" });
    expect(viewDecision(e, null, false)).toBe("deny");
  });
});
