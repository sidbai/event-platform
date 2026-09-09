import { describe, expect, it } from "vitest";

import { generatedUsername, normalizeUsername, validateUsername } from "./username";

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

describe("generatedUsername", () => {
  it("is something the rest of the app will accept", () => {
    /*
     * The test worth having. This handle is written straight to a column the
     * settings form later validates, so a shape validateUsername rejects
     * would leave people unable to save their own profile until they changed
     * a username they never chose.
     */
    const handle = generatedUsername("a1b2c3");
    expect(validateUsername(handle)).toBeNull();
    expect(normalizeUsername(handle)).toBe(handle);
  });

  it("says member rather than guessing at a role", () => {
    // Most people here are a parent or a team manager; a handle that guesses
    // "player" or "coach" is wrong more often than it is right.
    expect(generatedUsername("a1b2c3")).toBe("member_a1b2c3");
  });

  it("survives a token with anything odd in it", () => {
    expect(validateUsername(generatedUsername("A1-B2 C3"))).toBeNull();
    expect(generatedUsername("A1-B2 C3")).toBe("member_a1b2c3");
  });

  it("stays inside the column's limit", () => {
    expect(generatedUsername("f".repeat(60)).length).toBeLessThanOrEqual(30);
  });
});
