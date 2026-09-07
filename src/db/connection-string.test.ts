import { describe, expect, it } from "vitest";

import { describeConnectionProblem } from "./connection-string";

const GOOD = "postgresql://user:pw@host.neon.tech/neondb?sslmode=require";

describe("describeConnectionProblem", () => {
  it("passes a real connection string", () => {
    expect(describeConnectionProblem(GOOD)).toBeNull();
    expect(describeConnectionProblem("postgres://user@host/db")).toBeNull();
    expect(describeConnectionProblem(`  ${GOOD}  `)).toBeNull();
  });

  it("catches the host pasted on its own", () => {
    /*
     * The one that failed a deploy: switching Neon endpoints by pasting the
     * hostname. The driver's answer was ERR_INVALID_URL against a redacted
     * value, pointing at the line that builds the client.
     */
    const msg = describeConnectionProblem("ep-silent-field.aws.neon.tech/neondb");
    expect(msg).toMatch(/no scheme/);
    expect(msg).toMatch(/postgresql:\/\//);
  });

  it("catches the shell quotes coming along", () => {
    expect(describeConnectionProblem(`"${GOOD}"`)).toMatch(/quotes/);
    expect(describeConnectionProblem(`'${GOOD}'`)).toMatch(/quotes/);
  });

  it("catches the command coming along", () => {
    expect(describeConnectionProblem(`psql ${GOOD}`)).toMatch(/psql/);
  });

  it("says an unset variable is unset, rather than malformed", () => {
    expect(describeConnectionProblem(undefined)).toMatch(/not set/);
    expect(describeConnectionProblem("   ")).toMatch(/not set/);
  });

  it("never repeats the value, which holds a password", () => {
    // Build logs are kept, and this message goes into them.
    for (const bad of [`"${GOOD}"`, `psql ${GOOD}`, "host.neon.tech/db", "postgresql://u:p@ho st/db"]) {
      expect(describeConnectionProblem(bad)).not.toContain("pw");
      expect(describeConnectionProblem(bad)).not.toContain("neondb");
    }
  });

  it("catches a host the URL parser will not take", () => {
    // A space in the host is what a wrapped line in a dashboard field gives.
    expect(describeConnectionProblem("postgresql://u:p@ho st/db")).toMatch(
      /not a valid URL/,
    );
  });

  it("does not complain about an unencoded @ in the password", () => {
    // The parser takes the last @ as the separator, so this connects. Saying
    // otherwise would send someone editing a string that already works.
    expect(describeConnectionProblem("postgresql://u:p@ss@host/db")).toBeNull();
  });
});
