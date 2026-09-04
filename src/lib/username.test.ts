import { describe, expect, it } from "vitest";

import { normalizeUsername, validateUsername } from "./username";

describe("normalizeUsername", () => {
  it("lowercases and drops non-word chars", () => {
    expect(normalizeUsername("Jennifer.Martinez")).toBe("jennifermartinez");
  });
  it("keeps underscores", () => {
    expect(normalizeUsername("coach_jen")).toBe("coach_jen");
  });
  it("caps at 30", () => {
    expect(normalizeUsername("a".repeat(50)).length).toBe(30);
  });
});

describe("validateUsername", () => {
  it("accepts a normal handle", () => {
    expect(validateUsername("coach_jen")).toBeNull();
  });
  it("rejects too short", () => {
    expect(validateUsername("ab")).toMatch(/3 characters/);
  });
  it("rejects all digits", () => {
    expect(validateUsername("12345")).toMatch(/letter/);
  });
  it("rejects reserved words", () => {
    expect(validateUsername("admin")).toMatch(/reserved/);
    expect(validateUsername("settings")).toMatch(/reserved/);
  });
});
