/**
 * The check that stands in for an account on an anonymous review.
 *
 * Turnstile rather than reCAPTCHA: no puzzle for the reader, no Google
 * tracking script on a site about children, and the same job done. Rate My
 * Professors uses invisible reCAPTCHA v3 for this; the choice of vendor is not
 * the part of their approach worth copying.
 *
 * Worth being clear about what this buys, because it is easy to overrate: it
 * stops scripts. It does nothing about the abuse that actually threatens a
 * review site — a real person with an interest in the score, who passes any
 * captcha effortlessly. The moderation queue and the rate limiter carry that
 * weight.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaVerdict =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "missing" | "rejected" | "unreachable" };

/** Configured only when both halves are present; one alone is a misconfiguration. */
export function captchaConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}

/**
 * Whether to offer posting without an account at all.
 *
 * Every piece has to be present: both captcha keys and the secret the rate
 * limiter hashes addresses with. Miss one and the form falls back to asking
 * for a sign-in, which is the behaviour that was there before and is never
 * the wrong answer — only the less welcoming one.
 */
export function anonymousReviewsEnabled(): boolean {
  return captchaConfigured() && Boolean(process.env.RATE_LIMIT_SECRET);
}

/**
 * Verify a token with Cloudflare.
 *
 * Fails CLOSED on an unreachable verifier. An anonymous write has nothing else
 * standing in front of it, so "the check did not run" has to mean no, however
 * annoying that is during an outage — signing in remains available and skips
 * this path entirely.
 */
export async function verifyCaptcha(
  token: string | null,
  remoteIp: string | null,
): Promise<CaptchaVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!token) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      // Cloudflare is fast; a hung request must not hold a form submission open.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
