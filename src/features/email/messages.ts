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

/**
 * A claim was approved.
 *
 * Says what it grants and what it does not, because the two are easy to
 * assume wrongly: somebody who asked to "manage" a team and finds they
 * cannot change its age group would otherwise read a working rule as a
 * broken page.
 */
export function claimApprovedEmail(teamName: string, url: string): Message {
  const subject = `You can now manage ${teamName}`;
  const lines = [
    `Your request to manage ${teamName} on ${SITE} was approved.`,
    "",
    "You can now:",
    "  · add the team's description and its crest",
    "  · invite other managers, coaches and players",
    "  · put events on its calendar, and take scrimmage offers",
    "",
    "Two things stay with the club, so nobody can restate whose team it is:",
    "its club, birth years, gender and tier. To change the name, propose one",
    "from the team's settings and an admin will look at it.",
    "",
    url,
  ];
  const text = lines.join("\n");

  const html = [
    `<p>Your request to manage <strong>${escape(teamName)}</strong> on ${SITE} was approved.</p>`,
    "<p>You can now add the team&rsquo;s description and crest, invite other managers, coaches and players, put events on its calendar, and take scrimmage offers.</p>",
    "<p>Its club, birth years, gender and tier stay with the club, so nobody can restate whose team it is. To change the name, propose one from the team&rsquo;s settings and an admin will look at it.</p>",
    `<p><a href="${escape(url)}">${escape(url)}</a></p>`,
  ].join("\n");

  return { subject, text, html };
}

/**
 * A claim was not approved.
 *
 * No reason given, because there is rarely a good one to give: the note did
 * not say how to check, and saying that would read as an invitation to write
 * a better-sounding note rather than a truer one. What it does say is what
 * would settle it, which is somebody at the club confirming.
 */
export function claimRejectedEmail(teamName: string, url: string): Message {
  const subject = `About your request to manage ${teamName}`;
  const text = [
    `An admin looked at your request to manage ${teamName} on ${SITE} and did`,
    "not approve it. Nothing about the team has changed.",
    "",
    "This is usually because there was no way to check the request from the",
    "outside. If the club can confirm you run the team, ask them to get in",
    "touch and we will sort it out.",
    "",
    url,
  ].join("\n");

  const html = [
    `<p>An admin looked at your request to manage <strong>${escape(teamName)}</strong> on ${SITE} and did not approve it. Nothing about the team has changed.</p>`,
    "<p>This is usually because there was no way to check the request from the outside. If the club can confirm you run the team, ask them to get in touch and we will sort it out.</p>",
    `<p><a href="${escape(url)}">${escape(url)}</a></p>`,
  ].join("\n");

  return { subject, text, html };
}
