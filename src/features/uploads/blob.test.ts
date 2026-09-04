import { describe, expect, it } from "vitest";

import { isOurBlobUrl, parseUploadTarget } from "./blob";

describe("isOurBlobUrl", () => {
  it("accepts a URL from our own Blob store", () => {
    expect(
      isOurBlobUrl("https://abc123.public.blob.vercel-storage.com/avatars/x.png"),
    ).toBe(true);
  });

  it("rejects other hosts", () => {
    // The browser supplies this URL after uploading, so an attacker could
    // otherwise point a profile photo at any host they control.
    expect(isOurBlobUrl("https://evil.example.com/x.png")).toBe(false);
    expect(isOurBlobUrl("https://lh3.googleusercontent.com/a/x")).toBe(false);
  });

  it("rejects a host that merely contains the blob domain", () => {
    expect(
      isOurBlobUrl("https://public.blob.vercel-storage.com.evil.com/x.png"),
    ).toBe(false);
  });

  it("rejects non-https and unparseable input", () => {
    expect(
      isOurBlobUrl("http://abc.public.blob.vercel-storage.com/x.png"),
    ).toBe(false);
    expect(isOurBlobUrl("javascript:alert(1)")).toBe(false);
    expect(isOurBlobUrl("not a url")).toBe(false);
    expect(isOurBlobUrl("")).toBe(false);
  });
});

describe("parseUploadTarget", () => {
  it("reads the two known targets", () => {
    expect(parseUploadTarget('{"kind":"avatar"}')).toEqual({ kind: "avatar" });
    expect(parseUploadTarget('{"kind":"crest","teamSlug":"marymoor-united"}')).toEqual(
      { kind: "crest", teamSlug: "marymoor-united" },
    );
  });

  it("refuses anything else rather than guessing", () => {
    expect(parseUploadTarget(null)).toBeNull();
    expect(parseUploadTarget("")).toBeNull();
    expect(parseUploadTarget("not json")).toBeNull();
    expect(parseUploadTarget("[]")).toBeNull();
    expect(parseUploadTarget("null")).toBeNull();
    expect(parseUploadTarget('{"kind":"something-else"}')).toBeNull();
    // a crest target with no team can't be permission-checked
    expect(parseUploadTarget('{"kind":"crest"}')).toBeNull();
    expect(parseUploadTarget('{"kind":"crest","teamSlug":123}')).toBeNull();
  });
});
