import "server-only";

import { headers } from "next/headers";

import { checkAnonymousRateLimit } from "@/features/rate-limit";
import { clientIp, ipSubject } from "@/features/rate-limit/subject";

import { captchaConfigured, verifyCaptcha } from "./captcha";

/**
 * Everything that has to be true before a review with no account behind it is
 * accepted.
 *
 * Signing in skips all of this, which is deliberate: the account is the
 * stronger check, and the point of these is to be a weaker stand-in for it
 * rather than an extra hurdle for people who already identified themselves.
 *
 * Off unless deliberately configured. Missing captcha keys or a missing
 * RATE_LIMIT_SECRET mean anonymous posting is refused outright rather than
 * accepted unchecked — a half-configured deployment must not be the one that
 * takes unlimited anonymous writes.
 */
export type AnonVerdict = { ok: true } | { ok: false; error: string };

const SIGN_IN_INSTEAD = "Sign in to post instead.";

export async function allowAnonymousReview(
  token: string | null,
): Promise<AnonVerdict> {
  if (!captchaConfigured() || !process.env.RATE_LIMIT_SECRET) {
    return {
      ok: false,
      error: `Posting without an account isn't available right now. ${SIGN_IN_INSTEAD}`,
    };
  }

  const ip = clientIp(await headers());

  const captcha = await verifyCaptcha(token, ip);
  if (!captcha.ok) {
    // The reason is not returned to the caller: "rejected" and "unreachable"
    // are useful to an attacker tuning against the check, and useless to
    // everyone else.
    return {
      ok: false,
      error:
        captcha.reason === "missing"
          ? `Please complete the check below. ${SIGN_IN_INSTEAD}`
          : `We couldn't verify that request. Try again, or sign in to post.`,
    };
  }

  const gate = await checkAnonymousRateLimit(
    "review:create",
    ipSubject(ip, process.env.RATE_LIMIT_SECRET),
  );
  if (!gate.ok) return { ok: false, error: gate.message };

  return { ok: true };
}
