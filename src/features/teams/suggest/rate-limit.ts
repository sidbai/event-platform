/**
 * Telling "ask again later" from "this will never work".
 *
 * A free gateway tier refuses the twelfth of forty calls, and the SDK wraps
 * that in a retry error whose message is the only reliable place the reason
 * survives. Getting this wrong in one direction throws away answers already
 * paid for; in the other, it retries something that will never succeed.
 */
export function isRateLimited(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  return /rate.?limit|429/i.test(text);
}

/** Same function, named so a test can say what it is testing. */
export const isRateLimitedForTest = isRateLimited;
