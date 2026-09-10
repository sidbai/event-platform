import { describe, expect, it } from "vitest";

import { publicName } from "./public-name";

/**
 * The one line between "anonymous by default" and publishing a real name.
 *
 * It used to fall through to the provider's `name`, which was unreachable
 * only because two other files kept `displayName` filled in. These tests are
 * what makes it impossible rather than merely unreached.
 */
describe("publicName", () => {
  it("shows the display name, which starts as a generated handle", () => {
    expect(publicName({ displayName: "quiet-otter-418", username: "quiet-otter-418" })).toBe(
      "quiet-otter-418",
    );
  });

  it("falls back to the username, not to anything a provider gave us", () => {
    expect(publicName({ displayName: null, username: "quiet-otter-418" })).toBe(
      "@quiet-otter-418",
    );
  });

  it("says Someone rather than reaching for a real name", () => {
    expect(publicName({ displayName: null, username: null })).toBe("Someone");
  });

  it("cannot publish a name it is handed anyway", () => {
    // A caller may pass a row that still carries `name` — the admin claim
    // queues do, deliberately. It must not come out of here.
    const withRealName = {
      displayName: null,
      username: null,
      name: "Jane Coach",
      email: "jane@example.com",
    };
    expect(publicName(withRealName)).toBe("Someone");
    expect(publicName({ ...withRealName, username: "u" })).toBe("@u");
  });

  it("treats an empty display name as no display name", () => {
    // Settings writes the username back when the field is cleared, so this
    // should not happen — but `??` would have kept the empty string and
    // rendered a blank byline.
    expect(publicName({ displayName: "", username: "u" })).toBe("@u");
  });
});
