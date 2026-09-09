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

  it("never comes out all digits, whatever the token is", () => {
    // The reason there is a leading letter at all: hex is all digits about
    // six times in a hundred, and validateUsername refuses those.
    for (const token of ["483920", "000000", "111111", "999999", "0", "12"]) {
      const handle = generatedUsername(token);
      expect(handle).toMatch(/^[a-z]/);
      expect(validateUsername(handle)).toBeNull();
    }
  });

  it("carries no word in front of it", () => {
    // Every account is a member; the word cost seven characters on every
    // byline and said nothing.
    expect(generatedUsername("a1b2c3")).not.toMatch(/member|user|player/);
    expect(generatedUsername("a1b2c3").length).toBeLessThanOrEqual(9);
  });

  it("is the same handle for the same token", () => {
    expect(generatedUsername("a1b2c3")).toBe(generatedUsername("a1b2c3"));
  });

  it("leads with a letter nobody will misread", () => {
    // No i, l or o: this is a string people read off a screen and type back
    // into a URL, and those three live next to 1 and 0.
    const leads = new Set(
      Array.from({ length: 200 }, (_, n) =>
        generatedUsername(n.toString(16).padStart(6, "0")).charAt(0),
      ),
    );
    expect([...leads].every((c) => /[a-z]/.test(c))).toBe(true);
    expect(leads.has("i")).toBe(false);
    expect(leads.has("l")).toBe(false);
    expect(leads.has("o")).toBe(false);
  });

  it("survives a token with anything odd in it", () => {
    expect(validateUsername(generatedUsername("A1-B2 C3"))).toBeNull();
  });

  it("stays inside the column's limit", () => {
    expect(generatedUsername("f".repeat(60)).length).toBeLessThanOrEqual(30);
  });
});
