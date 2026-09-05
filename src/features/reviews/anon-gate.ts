import "server-only";

import { headers } from "next/headers";

import { checkAnonymousRateLimit } from "@/features/rate-limit";
import { clientIp, ipSubject } from "@/features/rate-limit/subject";

/**
 * Everything that has to be true before a review with no account behind it is
 * accepted.
 *
 * Signing in skips all of this, which is deliberate: the account is the
 * stronger check, and these are a weaker stand-in for it rather than an extra
 * hurdle for someone who already identified themselves.
 *
 * Right now that stand-in is one thing — a limit keyed on the connection.
 * A bot check belongs here too and is the next piece of work; until it lands,
 * a script that rotates addresses can post within the limit for each one.
 * That is why RATE_LIMIT_SECRET is the switch: leaving it unset keeps
 * anonymous posting off, and it should stay unset in production until the bot
 * check is in.
 */
export type AnonVerdict = { ok: true } | { ok: false; error: string };

export async function allowAnonymousReview(): Promise<AnonVerdict> {
  if (!process.env.RATE_LIMIT_SECRET) {
    return {
      ok: false,
      error: "Posting without an account isn't available right now. Sign in to post instead.",
    };
  }

  const ip = clientIp(await headers());
  const gate = await checkAnonymousRateLimit(
    "review:create",
    ipSubject(ip, process.env.RATE_LIMIT_SECRET),
  );
  if (!gate.ok) return { ok: false, error: gate.message };

  return { ok: true };
}

/**
 * Whether to offer posting without an account at all.
 *
 * One switch, deliberately: a deployment that has not set the secret the rate
 * limiter hashes addresses with has no working limit, and must not be the one
 * taking anonymous writes.
 */
export function anonymousReviewsEnabled(): boolean {
  return Boolean(process.env.RATE_LIMIT_SECRET);
}
