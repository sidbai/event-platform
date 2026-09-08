import { describe, expect, it } from "vitest";

import { signInEmail } from "./messages";

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
