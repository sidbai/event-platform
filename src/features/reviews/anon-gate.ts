import "server-only";

import { checkBotId } from "botid/server";
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
 * Two things stand in for it: a bot check, and a limit keyed on the
 * connection. They cover different abuse. The bot check stops scripts, which
 * the limit barely does because addresses are cheap to rotate. The limit stops
 * one determined person hammering a single club, which the bot check does not
 * see at all, because that person is not a bot.
 *
 * Neither stops what actually threatens a review site — a real human with an
 * interest in the score, posting once. Moderation carries that.
 */
export type AnonVerdict = { ok: true } | { ok: false; error: string };

export async function allowAnonymousReview(): Promise<AnonVerdict> {
  if (!process.env.RATE_LIMIT_SECRET) {
    return {
      ok: false,
      error: "Posting without an account isn't available right now. Sign in to post instead.",
    };
  }

  /*
   * Fails CLOSED, including when the check itself errors. An anonymous write
   * has nothing else in front of it, so "the check did not run" has to mean
   * no. Signing in skips this path entirely, so there is always a way through
   * for a real person.
   */
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return {
        ok: false,
        error: "We couldn't verify that request. Sign in to post instead.",
      };
    }
  } catch {
    return {
      ok: false,
      error: "We couldn't verify that request. Try again, or sign in to post.",
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
