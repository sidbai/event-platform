import { describe, expect, it } from "vitest";

import { claimApprovedEmail, claimRejectedEmail, signInEmail } from "./messages";

const URL_ = "https://kingjuansoccer.com/api/auth/callback/resend?token=abc&email=a%40b.com";

describe("signInEmail", () => {
  it("says where the link goes, in full", () => {
    // Written out rather than hidden behind "click here": seeing the address
    // is the one thing separating this from the phishing mail it resembles.
    const mail = signInEmail(URL_, 30);
    expect(mail.text).toContain(URL_);
    expect(mail.html).toContain("kingjuansoccer.com");
    expect(mail.html).not.toMatch(/click here/i);
  });

  it("says how long it lasts, and that it is single use", () => {
    const mail = signInEmail(URL_, 30);
    expect(mail.text).toContain("30 minutes");
    expect(mail.text).toMatch(/works once/);
  });

  it("tells somebody who did not ask that they need do nothing", () => {
    expect(signInEmail(URL_, 30).text).toMatch(/didn't ask/);
  });

  it("names the site in the subject, because inboxes are sorted by it", () => {
    expect(signInEmail(URL_, 30).subject).toBe("Sign in to King Juan Soccer");
  });

  it("escapes the URL into the markup", () => {
    // The callback carries an email address and a token; an unescaped & or "
    // would break the anchor and hand somebody a link that does not work.
    const mail = signInEmail('https://x.test/?a=1&b="2"<3', 30);
    expect(mail.html).toContain("a=1&amp;b=&quot;2&quot;&lt;3");
    expect(mail.html).not.toContain('b="2"<3');
  });

  it("carries the same words in both parts", () => {
    // The HTML is a courtesy copy, not a different message.
    const mail = signInEmail(URL_, 15);
    expect(mail.html).toContain("15 minutes");
    expect(mail.text).toContain("15 minutes");
  });
});

const TEAM = "Eastside FC GU12 Red";
const TEAM_URL = "https://kingjuansoccer.com/teams/eastside-fc-gu12-red";

describe("claimApprovedEmail", () => {
  it("names the team in the subject, where it will be skimmed", () => {
    expect(claimApprovedEmail(TEAM, TEAM_URL).subject).toBe(
      "You can now manage Eastside FC GU12 Red",
    );
  });

  it("says what it does not grant, not only what it does", () => {
    // Somebody who asked to "manage" a team and then cannot change its age
    // group would otherwise read a working rule as a broken page.
    const mail = claimApprovedEmail(TEAM, TEAM_URL);
    expect(mail.text).toMatch(/stay with the club/);
    expect(mail.text).toMatch(/propose one/);
    expect(mail.html).toMatch(/stay with the club/);
  });

  it("carries the link to the team", () => {
    expect(claimApprovedEmail(TEAM, TEAM_URL).text).toContain(TEAM_URL);
    expect(claimApprovedEmail(TEAM, TEAM_URL).html).toContain(TEAM_URL);
  });
});

describe("claimRejectedEmail", () => {
  it("says plainly that nothing changed", () => {
    const mail = claimRejectedEmail(TEAM, TEAM_URL);
    expect(mail.text).toMatch(/did\s+not approve it/);
    expect(mail.text).toMatch(/Nothing about the team has changed/);
  });

  it("says what would settle it", () => {
    // A refusal with no way forward is the one that turns into an email to
    // you anyway, so the mail names the route: the club confirming.
    expect(claimRejectedEmail(TEAM, TEAM_URL).text).toMatch(/club can confirm/);
  });

  it("escapes a team name into the markup", () => {
    const mail = claimApprovedEmail('XF "B14" <Gold>', TEAM_URL);
    expect(mail.html).toContain("XF &quot;B14&quot; &lt;Gold&gt;");
  });
});

/**
 * The layout, and the promise printed inside it.
 *
 * Both are checked on every message rather than on one, because the point of
 * putting them in a shell is that no message can be sent without them.
 */
const ALL = () => [
  signInEmail(URL_, 30),
  claimApprovedEmail(TEAM, TEAM_URL),
  claimRejectedEmail(TEAM, TEAM_URL),
];

describe("every message", () => {
  it("says the site is anonymous by default, in both parts", () => {
    for (const mail of ALL()) {
      expect(mail.text).toMatch(/Anonymous by default/);
      expect(mail.html).toMatch(/Anonymous by default/);
      expect(mail.text).toMatch(/generated handle, never your real name/);
      expect(mail.html).toMatch(/generated handle, never your real name/);
    }
  });

  it("says what is kept, including the part that is easy to leave out", () => {
    /*
     * A Google sign-in leaves a name and a picture on the account row — see
     * the adapter in auth.ts, which keeps them on purpose so an admin has
     * something to judge a team claim against. A notice that said "only your
     * email address" would be the one lie a privacy notice cannot afford.
     */
    for (const mail of ALL()) {
      expect(mail.text).toMatch(/email address is your account/);
      expect(mail.text).toMatch(/Google sign-in also leaves your name and a link/);
      expect(mail.html).toMatch(/never hold the photo itself/);
      expect(mail.text).toContain("https://kingjuansoccer.com/privacy");
    }
  });

  it("loads nothing from anywhere, so no inbox is asked to fetch a pixel", () => {
    // A remote image is a tracking pixel whether it is meant as one or not,
    // and a blocked one leaves a hole where the branding was.
    for (const mail of ALL()) {
      expect(mail.html).not.toMatch(/<img/i);
      expect(mail.html).not.toMatch(/background-image|url\(/i);
      expect(mail.html).not.toMatch(/<link|<script/i);
    }
  });

  it("styles inline and lays out in tables, which is what mail clients read", () => {
    for (const mail of ALL()) {
      expect(mail.html).toMatch(/<table role="presentation"/);
      // A <style> block is dropped by enough clients to be worth not relying on.
      expect(mail.html).not.toMatch(/<style/i);
    }
  });

  it("still reads as a whole message with every tag stripped out", () => {
    // The reason the plain part is written first: a client that renders none
    // of this must still leave somebody able to act.
    for (const mail of ALL()) {
      const stripped = mail.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      expect(stripped).toMatch(/King Juan Soccer/);
      expect(stripped).toMatch(/Anonymous by default/);
    }
  });
});

describe("the sign-in link, after the redesign", () => {
  it("shows the address as well as the button", () => {
    // A button whose destination cannot be read is the shape of every
    // phishing mail there is.
    const mail = signInEmail(URL_, 30);
    expect(mail.html).toContain("Or paste this into your browser");
    expect(mail.html).toContain(URL_.replace(/&/g, "&amp;"));
  });

  it("escapes the address everywhere it appears, button included", () => {
    // Three places now: the button's href, the paste link's href, and the
    // address printed as the paste link's text.
    const mail = signInEmail('https://x.test/?a=1&b="2"<3', 30);
    expect(mail.html).not.toContain('b="2"<3');
    expect(mail.html.match(/a=1&amp;b=&quot;2&quot;&lt;3/g)?.length).toBe(3);
  });

  it("keeps the preview line out of the body it previews", () => {
    // Shown beside the subject by clients that have it, and hidden by the
    // ones that do not — printing it twice reads as a stutter.
    const mail = signInEmail(URL_, 30);
    expect(mail.html).toContain("max-height:0");
  });
});
