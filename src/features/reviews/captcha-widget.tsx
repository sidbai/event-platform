"use client";

import Script from "next/script";

/**
 * The Turnstile challenge, usually invisible.
 *
 * Renders its own hidden field named captchaToken, which the server action
 * reads. Nothing here is a security boundary — a client can post whatever
 * token it likes; verifyCaptcha asking Cloudflare is what makes it mean
 * anything.
 */
export function CaptchaWidget({ siteKey }: { siteKey: string }) {
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-response-field-name="captchaToken"
      />
    </>
  );
}
