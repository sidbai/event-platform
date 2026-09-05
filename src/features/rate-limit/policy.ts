/**
 * Rate limit policy — pure, so the arithmetic is testable without a database.
 *
 * Every write in this app requires a signed-in user, so limits key on the user
 * id. That is why there is no IP handling here: nothing to hash, no
 * x-forwarded-for to distrust, and no personal data to store.
 */

export type Bucket =
  | "upload:token"
  | "review:create"
  | "claim:create"
  | "news:create"
  | "entry:edit"
  | "comment:create"
  | "event:create"
  | "invite:send"
  | "message:send"
  | "like:toggle";

export type Limit = {
  limit: number;
  windowSeconds: number;
  /**
   * What happened, without any timing — the caller appends how long to wait,
   * so the two can't drift into saying different things.
   */
  message: string;
};

const HOUR = 3600;
const DAY = 86400;

export const LIMITS: Record<Bucket, Limit> = {
  // The only limit with a bill attached: blob storage is the one thing abuse
  // costs real money on.
  "upload:token": {
    limit: 20,
    windowSeconds: HOUR,
    message: "That's a lot of uploads at once.",
  },
  "review:create": {
    limit: 5,
    windowSeconds: DAY,
    message:
      "You've posted several reviews today. Editing the reviews you already wrote still works.",
  },
  "claim:create": {
    limit: 3,
    windowSeconds: DAY,
    message: "You've sent a few claim requests today.",
  },
  "news:create": {
    limit: 5,
    windowSeconds: DAY,
    message: "You've submitted several posts today.",
  },
  // Deliberately generous: community editing should not feel policed, and a
  // bad edit is already reversible through the history.
  "entry:edit": {
    limit: 20,
    windowSeconds: DAY,
    message: "You've made a lot of edits today.",
  },
  "comment:create": {
    limit: 30,
    windowSeconds: HOUR,
    message: "You're posting quickly.",
  },
  "event:create": {
    limit: 10,
    windowSeconds: DAY,
    message: "You've created several events today.",
  },
  "invite:send": {
    limit: 50,
    windowSeconds: DAY,
    message: "You've sent a lot of invites today.",
  },
  "message:send": {
    limit: 60,
    windowSeconds: HOUR,
    message: "You're sending messages quickly.",
  },
  // Loose: hearting is cheap and harmless, this only stops a script.
  "like:toggle": {
    limit: 300,
    windowSeconds: HOUR,
    message: "That's a lot of likes at once.",
  },
};

/**
 * The start of the fixed window a moment falls in.
 *
 * Fixed rather than sliding: someone can burst across a boundary (five at
 * 23:59, five at 00:01), which does not matter for "reviews per day" and buys
 * a single SQL statement with no scripting and no clock skew.
 */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** Whether the count AFTER incrementing is still within the allowance. */
export function withinLimit(countAfterIncrement: number, limit: number): boolean {
  return countAfterIncrement <= limit;
}

/** Whole seconds until the window rolls over, never negative. */
export function retryAfterSeconds(
  now: Date,
  windowStart: Date,
  windowSeconds: number,
): number {
  const endsAt = windowStart.getTime() + windowSeconds * 1000;
  return Math.max(0, Math.ceil((endsAt - now.getTime()) / 1000));
}

/** How long the caller has to wait, in words. */
export function retryAfterLabel(seconds: number): string {
  if (seconds <= 60) return "a minute";
  if (seconds < HOUR) return `${Math.ceil(seconds / 60)} minutes`;
  if (seconds < DAY) {
    const h = Math.ceil(seconds / HOUR);
    return h === 1 ? "an hour" : `${h} hours`;
  }
  return "a day";
}
