import { describe, expect, it } from "vitest";

/*
 * The rate-limit detector, which is the part of the runner worth testing
 * without a database or a gateway: a 429 on the twelfth of forty calls must
 * be recognised, or the run throws away the eleven answers before it.
 */
import { isRateLimitedForTest } from "./rate-limit";

describe("isRateLimited", () => {
  it("recognises what the gateway actually sends", () => {
    // The real one, from a free-tier run against openai/gpt-4o-mini.
    const real = new Error(
      "Failed after 3 attempts. Last error: GatewayRateLimitError: Free tier requests on this model are rate-limited.",
    );
    expect(isRateLimitedForTest(real)).toBe(true);

    const named = Object.assign(new Error("too many requests"), {
      name: "GatewayRateLimitError",
    });
    expect(isRateLimitedForTest(named)).toBe(true);
    expect(isRateLimitedForTest(new Error("HTTP 429"))).toBe(true);
  });

  it("does not mistake other failures for a rate limit", () => {
    // These should stop the run too, but under their own name — a wrong
    // model or a dead network is not something re-running fixes.
    expect(isRateLimitedForTest(new Error("model not found"))).toBe(false);
    expect(isRateLimitedForTest(new Error("fetch failed"))).toBe(false);
    expect(isRateLimitedForTest("something odd")).toBe(false);
  });
});
