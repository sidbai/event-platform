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
