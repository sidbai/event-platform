/**
 * What our emails say — pure, so the words can be read in a test rather than
 * in somebody's inbox.
 *
 * Plain text is still written first and still says everything. The HTML is
 * now laid out rather than a bare stack of paragraphs, but it is built on the
 * same rule it always was: a client that drops the styling must leave a
 * readable message behind, because somebody who cannot read the mail cannot
 * sign in. So — tables and inline styles, which is what mail clients have
 * agreed on for twenty years, and **no images at all**. A remote image is a
 * tracking pixel whether it is meant as one or not, and most inboxes block it
 * anyway, so the wordmark is text.
 *
 * The sign-in link is written out in full underneath its button for the same
 * reason it always was: a button whose destination cannot be read is the
 * shape of every phishing mail there is.
 */

export type Message = { subject: string; text: string; html: string };

const SITE = "King Juan Soccer";
const SITE_URL = "https://kingjuansoccer.com";

/** The site's own palette, from globals.css. Inline, because email. */
const INK = "#1f2020";
const MUTED = "#5c5c5c";
const LINE = "#e7e7e9";
const PAGE = "#fafafa";
const CARD = "#ffffff";
const HEADER = "#1a1712";
const GOLD = "#c58a24";
const BRAND_TEXT = "#8a6a15";
const BRAND_SOFT = "#f8efdd";
const BRAND_SOFT_TEXT = "#6b520f";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes the few characters that would otherwise break out of the markup. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * What the site does with a person, in the two lines worth reading.
 *
 * On every message rather than only the first, because the question it
 * answers — "what have I just given you" — is asked at whatever moment
 * somebody happens to wonder, not on the schedule we would choose.
 *
 * The wording is what is actually true, which is narrower than it could be
 * made to sound. A Google sign-in leaves a name and a URL on the account row —
 * the picture is a link to Google's copy, never a file of ours — and saying
 * otherwise would be the one lie a privacy notice cannot afford. What is
 * unqualified is the part that matters: publicName cannot reach either of
 * them, so neither is ever shown.
 */
const PRIVACY_TEXT = [
  "Anonymous by default",
  "You appear under a generated handle, never your real name, unless you",
  "change it yourself in settings.",
  "",
  "Your email address is your account, and it is the only thing we need to",
  "keep. A Google sign-in also leaves your name and a link to your Google",
  "profile photo — we never hold the photo itself, neither is ever shown, and",
  "both go when the account does.",
  "",
  `${SITE_URL}/privacy`,
];

const PRIVACY_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 0;background:${BRAND_SOFT};border-radius:8px;">
  <tr><td style="padding:18px 20px;font-family:${FONT};">
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${BRAND_SOFT_TEXT};">Anonymous by default</p>
    <p style="margin:0 0 10px;font-size:13px;line-height:20px;color:${BRAND_SOFT_TEXT};">
      You appear under a generated handle, never your real name, unless you change it yourself in settings.
    </p>
    <p style="margin:0;font-size:13px;line-height:20px;color:${BRAND_SOFT_TEXT};">
      Your email address is your account, and it is the only thing we need to keep.
      A Google sign-in also leaves your name and a link to your Google profile photo
      &mdash; we never hold the photo itself, neither is ever shown, and both go when
      the account does.
    </p>
  </td></tr>
</table>`;

/**
 * The frame every message is poured into.
 *
 * `preheader` is the line an inbox shows beside the subject. Hidden in the
 * body, because a client that shows no preview text would otherwise print it
 * twice.
 */
function shell(preheader: string, body: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;padding:0;background:${PAGE};">
  <tr><td align="center" style="padding:24px 12px;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
      <tr><td style="background:${HEADER};padding:18px 24px;font-family:${FONT};">
        <a href="${SITE_URL}" style="font-size:16px;font-weight:600;letter-spacing:0.02em;color:${GOLD};text-decoration:none;">King Juan Soccer</a>
      </td></tr>
      <tr><td style="padding:28px 24px 24px;font-family:${FONT};color:${INK};">
${body}
${PRIVACY_HTML}
      </td></tr>
      <tr><td style="border-top:1px solid ${LINE};padding:16px 24px;font-family:${FONT};">
        <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">
          Youth soccer around Seattle &mdash;
          <a href="${SITE_URL}" style="color:${BRAND_TEXT};">kingjuansoccer.com</a>
          &middot; <a href="${SITE_URL}/privacy" style="color:${BRAND_TEXT};">Privacy</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/** A gold button. Always with the address written out somewhere near it. */
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
  <tr><td style="background:${GOLD};border-radius:8px;">
    <a href="${escape(url)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:${HEADER};text-decoration:none;">${label}</a>
  </td></tr>
</table>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:600;color:${INK};">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:23px;color:${INK};">${text}</p>`;
}

/** A quieter line, set apart from the thing it is a footnote to. */
function note(text: string): string {
  return `<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${MUTED};">${text}</p>`;
}

/** The address, readable, for somebody deciding whether to follow it. */
function rawUrl(url: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${MUTED};word-break:break-all;">Or paste this into your browser:<br><a href="${escape(url)}" style="color:${BRAND_TEXT};">${escape(url)}</a></p>`;
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
    "",
    "—",
    "",
    ...PRIVACY_TEXT,
  ].join("\n");

  const html = shell(
    `Your sign-in link — good once, for ${minutes} minutes.`,
    [
      h1(`Sign in to ${SITE}`),
      p(`The button below signs you in. It works once and expires in ${minutes} minutes.`),
      button(url, "Sign in"),
      rawUrl(url),
      note(
        "If you didn&rsquo;t ask to sign in, you can ignore this &mdash; nobody gets in without the link.",
      ),
    ].join("\n"),
  );

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
    "",
    "—",
    "",
    ...PRIVACY_TEXT,
  ];
  const text = lines.join("\n");

  const html = shell(
    `You can now manage ${teamName}.`,
    [
      h1(`You can now manage ${escape(teamName)}`),
      p(`Your request to manage <strong>${escape(teamName)}</strong> was approved.`),
      p("You can now add the team&rsquo;s description and crest, invite other managers, coaches and players, put events on its calendar, and take scrimmage offers."),
      p("Its club, birth years, gender and tier stay with the club, so nobody can restate whose team it is. To change the name, propose one from the team&rsquo;s settings and an admin will look at it."),
      button(url, "Open the team"),
      rawUrl(url),
    ].join("\n"),
  );

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
    "",
    "—",
    "",
    ...PRIVACY_TEXT,
  ].join("\n");

  const html = shell(
    `About your request to manage ${teamName}.`,
    [
      h1(`About ${escape(teamName)}`),
      p(`An admin looked at your request to manage <strong>${escape(teamName)}</strong> and did not approve it. Nothing about the team has changed.`),
      p("This is usually because there was no way to check the request from the outside. If the club can confirm you run the team, ask them to get in touch and we will sort it out."),
      button(url, "Open the team"),
      rawUrl(url),
    ].join("\n"),
  );

  return { subject, text, html };
}
