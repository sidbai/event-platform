/**
 * What our emails say — pure, so the words can be read in a test rather than
 * in somebody's inbox.
 *
 * Plain text first, and HTML only as a courtesy copy of the same words. A
 * sign-in link that renders as a wall of nothing in a client that blocks
 * images or CSS is a person who cannot get in, and every message this site
 * sends is short enough not to need a layout.
 */

export type Message = { subject: string; text: string; html: string };

const SITE = "King Juan Soccer";

/** Escapes the few characters that would otherwise break out of the markup. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The sign-in link.
 *
 * No branding beyond the name, no tracking pixel, no "click here" — the URL
 * is written out in full so a person can see where it goes before they follow
 * it, which is the one thing that separates this from the phishing mail it
 * otherwise resembles.
 */
export function signInEmail(url: string, minutes: number): Message {
  const subject = `Sign in to ${SITE}`;
  const text = [
    `Open this link to sign in to ${SITE}:`,
    "",
    url,
    "",
    `The link works once and expires in ${minutes} minutes.`,
    "If you didn't ask to sign in, you can ignore this — nobody gets in without the link.",
  ].join("\n");

  const html = [
    `<p>Open this link to sign in to ${SITE}:</p>`,
    `<p><a href="${escape(url)}">${escape(url)}</a></p>`,
    `<p>The link works once and expires in ${minutes} minutes.</p>`,
    `<p>If you didn't ask to sign in, you can ignore this &mdash; nobody gets in without the link.</p>`,
  ].join("\n");

  return { subject, text, html };
}
