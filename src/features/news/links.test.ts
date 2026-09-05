import { describe, expect, it } from "vitest";

import { canRenderImage, linkKind } from "./links";

const BLOB = "https://abc123.public.blob.vercel-storage.com";

describe("linkKind", () => {
  it("keeps same-site paths and fragments internal", () => {
    expect(linkKind("/news")).toBe("internal");
    expect(linkKind("/clubs/crossfire-premier")).toBe("internal");
    expect(linkKind("#results")).toBe("internal");
  });

  it("treats a protocol-relative URL as external, not internal", () => {
    // "//evil.example.com" starts with a slash but leaves the site. Reading it
    // as a path would route it through next/link and drop the noopener and
    // nofollow that every other off-site link gets.
    expect(linkKind("//evil.example.com")).toBe("external");
    expect(linkKind("//evil.example.com/path")).toBe("external");
  });

  it("allows the schemes a news article legitimately needs", () => {
    expect(linkKind("https://crossfirepremier.com")).toBe("external");
    expect(linkKind("http://example.com")).toBe("external");
    expect(linkKind("mailto:coach@example.com")).toBe("external");
  });

  it("refuses script-bearing schemes", () => {
    expect(linkKind("javascript:alert(1)")).toBe("unsafe");
    expect(linkKind("JavaScript:alert(1)")).toBe("unsafe");
    expect(linkKind("data:text/html,<script>alert(1)</script>")).toBe("unsafe");
    expect(linkKind("vbscript:msgbox(1)")).toBe("unsafe");
    expect(linkKind("blob:https://example.com/abc")).toBe("unsafe");
  });

  it("refuses anything it cannot parse, rather than guessing a scheme", () => {
    expect(linkKind("example.com")).toBe("unsafe");
    expect(linkKind("")).toBe("unsafe");
    expect(linkKind(undefined)).toBe("unsafe");
  });
});

describe("canRenderImage", () => {
  it("accepts an image uploaded here", () => {
    expect(canRenderImage(`${BLOB}/news/photo.jpg`)).toBe(true);
  });

  it("refuses another host rather than hotlinking it", () => {
    expect(canRenderImage("https://example.com/photo.jpg")).toBe(false);
    expect(canRenderImage("http://abc123.public.blob.vercel-storage.com/x.jpg")).toBe(
      false,
    );
  });

  it("refuses a non-string src", () => {
    expect(canRenderImage(undefined)).toBe(false);
    expect(canRenderImage(null)).toBe(false);
  });
});
