import { afterEach, describe, expect, it, vi } from "vitest";

import { siteUrl } from "./site-url";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("uses SITE_URL when set", () => {
    vi.stubEnv("SITE_URL", "https://kingjuansoccer.com");
    expect(siteUrl()).toBe("https://kingjuansoccer.com");
  });

  it("trims a trailing slash", () => {
    vi.stubEnv("SITE_URL", "https://kingjuansoccer.com/");
    expect(siteUrl()).toBe("https://kingjuansoccer.com");
  });

  it("ignores an empty SITE_URL (the Vercel bug)", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("falls back to the Vercel production domain", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "event-platform.vercel.app");
    expect(siteUrl()).toBe("https://event-platform.vercel.app");
  });

  it("produces a value that new URL() accepts", () => {
    vi.stubEnv("SITE_URL", "");
    expect(() => new URL(siteUrl())).not.toThrow();
  });
});
