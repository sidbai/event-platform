import { describe, expect, it } from "vitest";

import { canRenderImage, embedOf, linkKind } from "./links";

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

describe("embedOf", () => {
  it("reads a YouTube video id out of every way people paste one", () => {
    for (const href of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(embedOf(href)).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
    }
  });

  it("reads a Vimeo id, and a video uploaded here", () => {
    expect(embedOf("https://vimeo.com/123456789")).toEqual({ kind: "vimeo", id: "123456789" });
    const ours = "https://abc.public.blob.vercel-storage.com/news/video/demo-x1.mp4";
    expect(embedOf(ours)).toEqual({ kind: "video", src: ours });
  });

  it("frames nothing else", () => {
    expect(embedOf("https://www.youtube.com/user/somebody")).toBeNull();
    expect(embedOf("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(embedOf("http://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(embedOf("https://evil.example/news/video/demo.mp4")).toBeNull();
    expect(embedOf("https://abc.public.blob.vercel-storage.com/news/cover.png")).toBeNull();
    expect(embedOf("javascript:alert(1)")).toBeNull();
    expect(embedOf(undefined)).toBeNull();
  });
});
