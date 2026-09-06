/**
 * Who we are allowed to read automatically, and on what evidence.
 *
 * This exists because the evidence turned out to be the opposite of the
 * intuition. robots.txt is a crawler convention; the terms of service are the
 * contract, and on these two platforms they disagree about which is the safer
 * one to read:
 *
 *   Athletes2Events  robots.txt lets us at the schedule pages, and the terms
 *                    say "scrape or harvest data without permission" is not
 *                    allowed.
 *   EventConnect     robots.txt refuses everything, and the terms say nothing
 *                    about automated access at all.
 *
 * A decision made once and remembered by whoever happened to make it is a
 * decision that quietly stops being true. So it lives here, with the date it
 * was checked and a link to what was read, and the sync layer asks this
 * before it fetches anything.
 */

export type Platform = keyof typeof PROVIDER_POLICIES;

export type AutomatedAccess =
  /** Checked, and nothing we read forbids it. */
  | "allowed"
  /** Their terms require asking first, and we have not been told yes. */
  | "permission-required"
  /** We have asked and are waiting. Same effect as not being allowed. */
  | "pending"
  /** They have said no, or told us to stop. */
  | "refused"
  /** Nothing to poll: data that arrives by hand. */
  | "not-applicable";

export type ProviderPolicy = {
  automatedAccess: AutomatedAccess;
  /** What robots.txt says about the pages we would read. */
  robots: "allows" | "disallows" | "not-applicable";
  /** What was read to decide this, so the next person can check it changed. */
  termsUrl: string | null;
  /** ISO date. A stale decision should look stale. */
  reviewedAt: string;
  note: string;
};

export const PROVIDER_POLICIES = {
  athletes2events: {
    automatedAccess: "permission-required",
    robots: "allows",
    termsUrl: "https://athletes2events.com/web/terms-and-conditions",
    reviewedAt: "2026-09-06",
    note: 'Acceptable Use: "You may not ... scrape or harvest data without permission." Not a prohibition — a permission requirement. Asking is the fix.',
  },
  eventconnect: {
    automatedAccess: "permission-required",
    robots: "disallows",
    termsUrl: "https://eventconnectsports.com/terms-of-service/",
    reviewedAt: "2026-09-06",
    note: "Terms say nothing about scraping, but app.eventconnect.io/robots.txt is a blanket Disallow and they sell an API. Silence is not permission.",
  },
  manual: {
    automatedAccess: "not-applicable",
    robots: "not-applicable",
    termsUrl: null,
    reviewedAt: "2026-09-06",
    note: "Entered or pasted by a person. Nothing is fetched, so there is nothing to permit.",
  },
} satisfies Record<string, ProviderPolicy>;

/**
 * Platforms the owner has decided to keep polling despite the policy above.
 *
 * Deliberately an environment variable rather than a code change: an
 * exception that has to be re-stated to survive a deploy is an exception that
 * expires on its own, which is the right default for one taken knowingly and
 * temporarily. Removing it is how it ends.
 */
export function overriddenPlatforms(env = process.env.SYNC_OVERRIDE_PLATFORMS): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type PollDecision =
  | { may: true; overridden: boolean }
  | { may: false; reason: string };

/** Whether this platform may be fetched on a timer right now, and why not. */
export function mayPoll(platform: string, env?: string): PollDecision {
  // Widened deliberately: `satisfies` above narrows each entry to the literal
  // it currently holds, and a check against a status no platform has yet is
  // exactly the check that has to survive one being granted.
  const policy: ProviderPolicy | undefined = PROVIDER_POLICIES[platform as Platform];
  if (!policy) return { may: false, reason: `no policy recorded for ${platform}` };

  if (policy.automatedAccess === "allowed") return { may: true, overridden: false };

  if (overriddenPlatforms(env).has(platform)) {
    return { may: true, overridden: true };
  }

  return {
    may: false,
    reason:
      policy.automatedAccess === "not-applicable"
        ? `${platform} is not fetched`
        : `${platform}: ${policy.automatedAccess}`,
  };
}
