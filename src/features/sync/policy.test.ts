import { describe, expect, it } from "vitest";

import { PROVIDER_POLICIES, mayPoll, overriddenPlatforms, platformOf } from "./policy";

describe("what we recorded about each platform", () => {
  it("keeps the evidence, not just the verdict", () => {
    // A verdict with no link and no date is a decision nobody can re-check,
    // and terms change: A2E's were updated four months ago.
    for (const [name, policy] of Object.entries(PROVIDER_POLICIES)) {
      expect(policy.reviewedAt, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Read by people, so it carries the platform's own capitalisation.
      expect(policy.label, name).not.toBe(name);
      expect(policy.note.length, name).toBeGreaterThan(20);
      if (policy.automatedAccess !== "not-applicable") {
        expect(policy.termsUrl, name).toMatch(/^https:\/\//);
      }
    }
  });

  it("follows robots.txt, and records where the terms disagree", () => {
    /*
     * The owner's rule: the machine-readable signal governs. A2E's robots.txt
     * allows the schedule pages — the same permission Google indexes them
     * under — so we read them; its terms also ask for permission, which is
     * noted and has been requested. EventConnect refuses every crawler
     * including Googlebot, so we link and do not read.
     */
    expect(PROVIDER_POLICIES.athletes2events.robots).toBe("allows");
    expect(PROVIDER_POLICIES.athletes2events.automatedAccess).toBe("allowed");
    // The note is a record, not a plan. It said permission "has been
    // requested" when no request had been made — a policy file that describes
    // something nobody did is worse than one that says nothing.
    expect(PROVIDER_POLICIES.athletes2events.note).toMatch(/no request has been made/);

    expect(PROVIDER_POLICIES.eventconnect.robots).toBe("disallows");
    expect(PROVIDER_POLICIES.eventconnect.automatedAccess).toBe("refused");
  });

  it("cannot be overridden into reading a platform that refuses crawlers", () => {
    // The one line that must not be a matter of remembering: a blanket
    // Disallow is the site saying no in the only way a machine can read, and
    // an environment variable is not an answer to it.
    expect(mayPoll("eventconnect", "eventconnect").may).toBe(false);
  });
});

describe("mayPoll", () => {
  const waiting = {
    gotsport: {
      label: "GotSport",
      automatedAccess: "pending",
      robots: "allows",
      termsUrl: "https://example.test/terms",
      reviewedAt: "2026-09-06",
      note: "Asked, no answer yet — the state every new platform starts in.",
    },
  } as const;

  it("reads a platform whose robots.txt allows it", () => {
    expect(mayPoll("athletes2events", "")).toEqual({ may: true, overridden: false });
  });

  it("refuses a platform we have asked about but not heard from", () => {
    const decision = mayPoll("gotsport", "", waiting);
    expect(decision.may).toBe(false);
    expect(decision).toHaveProperty("reason");
  });

  it("names the platform as it names itself", () => {
    const decision = mayPoll("eventconnect");
    expect(decision.may).toBe(false);
    expect(decision).toMatchObject({ reason: "EventConnect refuses crawlers" });
  });

  it("refuses a platform nobody has assessed at all", () => {
    // A connector added without anyone reading the terms is the failure this
    // is here to prevent, so an unknown platform is a no rather than a shrug.
    expect(mayPoll("gotsport", "").may).toBe(false);
  });

  it("lets the owner run one knowingly while waiting, and says that it is that", () => {
    expect(mayPoll("gotsport", "gotsport", waiting)).toEqual({
      may: true,
      overridden: true,
    });
  });

  it("does not let an override for one platform cover another", () => {
    expect(mayPoll("eventconnect", "gotsport").may).toBe(false);
  });

  it("ends when the override is taken away, without a code change", () => {
    // The point of putting it in the environment: an exception that has to be
    // restated to survive a deploy expires on its own.
    expect(mayPoll("gotsport", "gotsport", waiting).may).toBe(true);
    expect(mayPoll("gotsport", undefined, waiting).may).toBe(false);
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

describe("platformOf", () => {
  it("recognises a platform we can read", () => {
    expect(platformOf("https://crossfire.athletes2events.com/events/130/groups")).toBe(
      "athletes2events",
    );
  });

  it("recognises one we cannot, which is the point", () => {
    // Knowing it is EventConnect is what lets the admin be told their paste
    // became a link because that site refuses crawlers — rather than leaving
    // it indistinguishable from "we have not built that connector yet".
    expect(
      platformOf("https://app.eventconnect.io/events/42108/scheduling-scoring"),
    ).toBe("eventconnect");
  });

  it("is not fooled by a lookalike host", () => {
    expect(platformOf("https://athletes2events.com.evil.test/events/1")).toBeNull();
    expect(platformOf("https://notathletes2events.com/events/1")).toBeNull();
  });

  it("has no opinion about a site nobody has assessed", () => {
    expect(platformOf("https://system.gotsport.com/events/123")).toBeNull();
    expect(platformOf("not a url")).toBeNull();
  });
});

/**
 * The three registries a platform has to appear in, and the failure when it
 * does not appear in all of them.
 *
 * Modular11 was added to PROVIDER_POLICIES and to the provider list but not
 * to the host table, so connecting its URL produced "we have not assessed
 * that site. It will not refresh by itself" — a connector that existed,
 * worked, and was never reached. Nothing failed; it just quietly saved a link.
 */
describe("a platform is registered in every place it has to be", () => {
  const withConnector = ["athletes2events", "modular11", "sportsaffinity"] as const;

  it("recognises the URL of every platform that has a connector", () => {
    const sample: Record<(typeof withConnector)[number], string> = {
      athletes2events: "https://crossfire.athletes2events.com/events/123",
      modular11: "https://www.modular11.com/league-schedule/elite-academy-league/47",
      sportsaffinity:
        "https://wys.sportsaffinity.com/tour/public/info/accepted_list.asp?Tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B",
    };
    for (const platform of withConnector) {
      expect(platformOf(sample[platform])).toBe(platform);
    }
  });

  it("has a policy recorded for every platform it recognises", () => {
    for (const platform of withConnector) {
      expect(PROVIDER_POLICIES[platform]).toBeDefined();
    }
  });

  it("would let each of them be polled", () => {
    // A connector nothing may call is the same as no connector, and this is
    // the check that says which of the two a platform is in.
    for (const platform of withConnector) {
      expect(mayPoll(platform).may).toBe(true);
    }
  });
});
