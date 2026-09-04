import { describe, expect, it, vi } from "vitest";

import { normalizeEmail } from "./admin";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Sid@Example.COM ")).toBe("sid@example.com");
  });

  it("drops a +tag", () => {
    expect(normalizeEmail("sid+kjs@example.com")).toBe("sid@example.com");
  });

  it("drops dots for gmail", () => {
    expect(normalizeEmail("sid.umn@gmail.com")).toBe("sidumn@gmail.com");
  });

  it("treats googlemail.com as gmail.com", () => {
    expect(normalizeEmail("s.i.d@googlemail.com")).toBe("sid@gmail.com");
  });

  it("keeps dots for non-gmail domains", () => {
    expect(normalizeEmail("first.last@company.com")).toBe("first.last@company.com");
  });
});

describe("isAdmin", () => {
  it("matches a Gmail admin across dot/tag variants", async () => {
    vi.resetModules();
    vi.stubEnv("ADMIN_EMAILS", "sidumn@gmail.com");
    const { isAdmin } = await import("./admin");
    expect(isAdmin({ email: "sid.umn@gmail.com" })).toBe(true);
    expect(isAdmin({ email: "sid.umn+test@gmail.com" })).toBe(true);
    expect(isAdmin({ email: "someone@else.com" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    vi.unstubAllEnvs();
  });
});
