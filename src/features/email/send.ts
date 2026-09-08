import "server-only";

import type { Message } from "./messages";

/**
 * Sending one email, over Resend's HTTP API.
 *
 * A fetch rather than their SDK. It is one POST, the SDK would be a
 * dependency in the bundle for the sake of it, and Auth.js's own Resend
 * provider does exactly this — so this is the same call, with our words and
 * our error handling instead of theirs.
 *
 * Configured by two variables, and honest when they are missing: a
 * deployment without them does not crash, it reports that nothing was sent.
 * That matters because most of what this will send is a notification, and a
 * notification failing must never take down the thing that triggered it —
 * approving a claim should approve the claim.
 *
 * Sign-in is the exception, and its caller is expected to treat `sent: false`
 * as an error, because a person waiting for a link that was never sent has no
 * way to find that out on their own.
 */

export type SendResult =
  | { sent: true }
  | { sent: false; reason: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, message: Message): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    return { sent: false, reason: "email is not configured on this deployment" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      /*
       * Their message, not ours — "domain is not verified" and "invalid API
       * key" are the two that actually happen, and both are things only the
       * deployment's owner can fix. Swallowing them into "could not send"
       * would cost an afternoon of guessing.
       */
      const detail = await response.text();
      return { sent: false, reason: `resend ${response.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "could not reach the mail service",
    };
  }
}
