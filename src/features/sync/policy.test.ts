import { describe, expect, it } from "vitest";

import { PROVIDER_POLICIES, mayPoll, overriddenPlatforms } from "./policy";

describe("what we recorded about each platform", () => {
  it("keeps the evidence, not just the verdict", () => {
    // A verdict with no link and no date is a decision nobody can re-check,
    // and terms change: A2E's were updated four months ago.
    for (const [name, policy] of Object.entries(PROVIDER_POLICIES)) {
      expect(policy.reviewedAt, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(policy.note.length, name).toBeGreaterThan(20);
      if (policy.automatedAccess !== "not-applicable") {
        expect(policy.termsUrl, name).toMatch(/^https:\/\//);
      }
    }
  });

  it("does not read robots.txt as the answer", () => {
    // The whole reason this file exists. A2E's robots.txt allows the schedule
    // pages and its terms require permission; EventConnect is the other way
    // round. Either one alone gives the wrong answer.
    expect(PROVIDER_POLICIES.athletes2events.robots).toBe("allows");
    expect(PROVIDER_POLICIES.athletes2events.automatedAccess).toBe("permission-required");
    expect(PROVIDER_POLICIES.eventconnect.robots).toBe("disallows");
    expect(PROVIDER_POLICIES.eventconnect.automatedAccess).toBe("permission-required");
  });
});

describe("mayPoll", () => {
  it("refuses a platform that has not said yes", () => {
    const decision = mayPoll("athletes2events", "");
    expect(decision.may).toBe(false);
    expect(decision).toHaveProperty("reason");
  });

  it("refuses a platform nobody has assessed at all", () => {
    // A connector added without anyone reading the terms is the failure this
    // is here to prevent, so an unknown platform is a no rather than a shrug.
    expect(mayPoll("gotsport", "").may).toBe(false);
  });

  it("lets the owner keep one running knowingly, and says that it is that", () => {
    const decision = mayPoll("athletes2events", "athletes2events");
    expect(decision).toEqual({ may: true, overridden: true });
  });

  it("does not let an override for one platform cover another", () => {
    expect(mayPoll("eventconnect", "athletes2events").may).toBe(false);
  });

  it("ends when the override is taken away, without a code change", () => {
    // The point of putting it in the environment: an exception that has to be
    // restated to survive a deploy expires on its own.
    expect(mayPoll("athletes2events", "athletes2events").may).toBe(true);
    expect(mayPoll("athletes2events", undefined).may).toBe(false);
  });

  it("never polls data that arrives by hand", () => {
    expect(mayPoll("manual", "manual").may).toBe(true); // override still honoured
    expect(mayPoll("manual", "").may).toBe(false);
  });
});

describe("overriddenPlatforms", () => {
  it("takes a list, however it was typed", () => {
    expect([...overriddenPlatforms(" Athletes2Events , eventconnect ")]).toEqual([
      "athletes2events",
      "eventconnect",
    ]);
  });

  it("is empty when unset", () => {
    expect(overriddenPlatforms(undefined).size).toBe(0);
    expect(overriddenPlatforms("").size).toBe(0);
  });
});
