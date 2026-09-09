/**
 * Who we are allowed to read automatically, and on what evidence.
 *
 * The rule is robots.txt: the site's own machine-readable statement about
 * automated access governs, which is the arrangement the whole web runs on
 * and the one search engines index under.
 *
 *   Athletes2Events  four admin paths disallowed, everything else allowed —
 *                    the same permission Google indexes those schedules
 *                    under. We read them. Their terms separately ask for
 *                    permission, which has not been sought; that is recorded
 *                    below rather than resolved by this file.
 *   EventConnect     a blanket Disallow, which refuses Googlebot as much as
 *                    us — no search engine has these schedules at all. We
 *                    link, and do not read.
 *
 * A decision made once and remembered by whoever happened to make it is a
 * decision that quietly stops being true. So it lives here with the date it
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
  /** What the platform calls itself, for anything a person reads. */
  label: string;
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
    label: "Athletes2Events",
    automatedAccess: "allowed",
    robots: "allows",
    termsUrl: "https://athletes2events.com/web/terms-and-conditions",
    reviewedAt: "2026-09-06",
    note: 'robots.txt disallows four admin paths and allows the rest, which is the permission Google indexes these schedules under — ask an AI about a team and it cites crossfire.athletes2events.com. The terms separately ask for permission for scraping; no request has been made, and the owner\'s decision is that the machine-readable signal is the one we follow. If A2E ever asks us to stop, this becomes "refused" and the connector stops with it.',
  },
  eventconnect: {
    label: "EventConnect",
    automatedAccess: "refused",
    robots: "disallows",
    termsUrl: "https://eventconnectsports.com/terms-of-service/",
    reviewedAt: "2026-09-06",
    note: "app.eventconnect.io/robots.txt is a blanket Disallow, which refuses Googlebot too — no search engine has these schedules, and an AI asked about a team there is reduced to saying contact the tournament directors. Their terms are silent on scraping, but silence is not permission. Link only. Embedding is closed as well: X-Frame-Options: SAMEORIGIN.",
  },
  athleteone: {
    label: "AthleteOne",
    automatedAccess: "refused",
    robots: "disallows",
    /*
     * Their robots.txt, because that is genuinely the document this decision
     * was read from. The footer's "Terms of Use Agreement" opens in-app and
     * carries no address — /terms, /terms-of-use and /termsofuse are all 404 —
     * and not being able to find the binding document is a reason to be more
     * careful rather than less.
     */
    termsUrl: "https://app.athleteone.com/robots.txt",
    reviewedAt: "2026-09-08",
    note: "app.athleteone.com/robots.txt is a blanket Disallow with only the auth pages allowed, and it names the AI crawlers individually on top of that. The schedule is client-rendered, so reading it without a browser would mean calling their internal API — which the Disallow covers whatever the transport. Their public event pages carry no export of any kind: no CSV, no print, no iCal. Divisions are click handlers rather than links, so there is no address list to hand anybody. A person can still open a page and copy what is on it: the bookmarklet in copier.ts reads the AthleteOne row shape and collects across flights.",
  },
  manual: {
    label: "Entered by hand",
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
export function mayPoll(
  platform: string,
  env?: string,
  /*
   * Injectable so the waiting-for-an-answer case can be tested without
   * inventing a platform in the real registry. Nothing is in that state
   * today; the next one we ask about will be.
   */
  policies: Record<string, ProviderPolicy> = PROVIDER_POLICIES,
): PollDecision {
  const policy: ProviderPolicy | undefined = policies[platform];
  if (!policy) return { may: false, reason: `no policy recorded for ${platform}` };

  if (policy.automatedAccess === "allowed") return { may: true, overridden: false };

  /*
   * Not overridable. A blanket Disallow is the site saying no in the only way
   * a machine can read, and an environment variable is not an answer to it —
   * so this one is structural rather than a matter of anybody's discipline.
   */
  if (policy.automatedAccess === "refused") {
    return { may: false, reason: `${policy.label} refuses crawlers` };
  }

  if (overriddenPlatforms(env).has(platform)) {
    return { may: true, overridden: true };
  }

  return {
    may: false,
    reason:
      policy.automatedAccess === "not-applicable"
        ? `${policy.label} is not fetched`
        : `${policy.label}: ${policy.automatedAccess}`,
  };
}

/**
 * Which platform a URL belongs to, whether or not we can read it.
 *
 * Separate from the provider registry on purpose. Recognising EventConnect
 * and having a connector for EventConnect are different questions, and only
 * the first one lets an admin be told *why* their paste became a link rather
 * than a sync. Without this, "their robots.txt refuses crawlers" and "we have
 * not built that yet" look identical from the outside.
 */
const HOSTS: { pattern: RegExp; platform: Platform }[] = [
  { pattern: /(^|\.)athletes2events\.com$/i, platform: "athletes2events" },
  { pattern: /(^|\.)eventconnect\.io$/i, platform: "eventconnect" },
];

export function platformOf(url: string): Platform | null {
  try {
    const { hostname } = new URL(url);
    return HOSTS.find((h) => h.pattern.test(hostname))?.platform ?? null;
  } catch {
    return null;
  }
}
