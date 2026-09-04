import { describe, expect, it } from "vitest";

import {
  isOurBlobUrl,
  isPendingClubUrl,
  isPendingCrestUrl,
  parseUploadTarget,
  pathnameMatchesTarget,
} from "./blob";

const HOST = "https://abc123.public.blob.vercel-storage.com";

describe("isPendingCrestUrl", () => {
  it("accepts a crest staged during team creation", () => {
    expect(isPendingCrestUrl(`${HOST}/crests/_pending/badge-x1.png`)).toBe(true);
  });

  it("refuses a live team's crest", () => {
    // otherwise a new team could adopt an existing team's file, and that team
    // replacing its crest would delete the image out from under the new one
    expect(
      isPendingCrestUrl(`${HOST}/crests/marymoor-united/badge-x1.png`),
    ).toBe(false);
  });

  it("refuses avatars and foreign hosts", () => {
    expect(isPendingCrestUrl(`${HOST}/avatars/me.png`)).toBe(false);
    expect(
      isPendingCrestUrl("https://evil.example.com/crests/_pending/x.png"),
    ).toBe(false);
  });

  it("refuses a lookalike prefix", () => {
    expect(isPendingCrestUrl(`${HOST}/crests/_pendingXX/x.png`)).toBe(false);
    expect(isPendingCrestUrl(`${HOST}/x/crests/_pending/x.png`)).toBe(false);
  });
});

describe("isPendingClubUrl", () => {
  it("accepts a logo staged while adding a club", () => {
    expect(isPendingClubUrl(`${HOST}/clubs/_pending/logo-x1.png`)).toBe(true);
  });

  it("refuses a live club's logo and a team crest", () => {
    // a new club must not adopt an existing club's file, or a team's
    expect(isPendingClubUrl(`${HOST}/clubs/seattle-united/logo.png`)).toBe(false);
    expect(isPendingClubUrl(`${HOST}/crests/_pending/badge.png`)).toBe(false);
  });
});

describe("pathnameMatchesTarget", () => {
  const avatar = { kind: "avatar" } as const;
  const crest = { kind: "crest", teamSlug: "marymoor-united" } as const;

  it("puts a new team's crest in the staging folder", () => {
    const staged = { kind: "new-crest" } as const;
    expect(pathnameMatchesTarget("crests/_pending/badge.png", staged)).toBe(true);
    // and cannot be aimed at a real team from there
    expect(pathnameMatchesTarget("crests/marymoor-united/x.png", staged)).toBe(
      false,
    );
  });

  it("keeps one club's logo out of another club's folder", () => {
    const mine = { kind: "club", clubSlug: "rain-city-sc" } as const;
    expect(pathnameMatchesTarget("clubs/rain-city-sc/logo.png", mine)).toBe(true);
    expect(pathnameMatchesTarget("clubs/seattle-united/logo.png", mine)).toBe(
      false,
    );
    expect(pathnameMatchesTarget("clubs/_pending/logo.png", mine)).toBe(false);
  });

  it("accepts a single file directly under the target's prefix", () => {
    expect(pathnameMatchesTarget("avatars/me.png", avatar)).toBe(true);
    expect(
      pathnameMatchesTarget("crests/marymoor-united/badge.png", crest),
    ).toBe(true);
  });

  it("refuses a path belonging to a different target", () => {
    // the client chooses the pathname, so this is the check that stops one
    // team's upload landing in another team's folder
    expect(
      pathnameMatchesTarget("crests/some-other-team/badge.png", crest),
    ).toBe(false);
    expect(pathnameMatchesTarget("avatars/me.png", crest)).toBe(false);
    expect(pathnameMatchesTarget("crests/marymoor-united/x.png", avatar)).toBe(
      false,
    );
  });

  it("refuses traversal and nesting", () => {
    expect(pathnameMatchesTarget("avatars/../crests/x.png", avatar)).toBe(false);
    expect(pathnameMatchesTarget("avatars/sub/dir.png", avatar)).toBe(false);
    expect(pathnameMatchesTarget("avatars/", avatar)).toBe(false);
  });

  it("refuses a prefix that only looks right", () => {
    expect(pathnameMatchesTarget("avatars-evil/x.png", avatar)).toBe(false);
    expect(
      pathnameMatchesTarget("crests/marymoor-united-evil/x.png", crest),
    ).toBe(false);
  });
});

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
  it("reads the known targets", () => {
    expect(parseUploadTarget('{"kind":"avatar"}')).toEqual({ kind: "avatar" });
    expect(parseUploadTarget('{"kind":"new-crest"}')).toEqual({ kind: "new-crest" });
    expect(parseUploadTarget('{"kind":"new-club"}')).toEqual({ kind: "new-club" });
    expect(parseUploadTarget('{"kind":"club","clubSlug":"seattle-united"}')).toEqual(
      { kind: "club", clubSlug: "seattle-united" },
    );
    // a club target with no slug can't be permission-checked
    expect(parseUploadTarget('{"kind":"club"}')).toBeNull();
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
