import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { isAdmin } from "@/features/auth/admin";
import type { CurrentUser } from "@/features/auth";

import {
  LIMITS,
  retryAfterLabel,
  retryAfterSeconds,
  windowStartFor,
  withinLimit,
  type Bucket,
} from "./policy";

export type { Bucket } from "./policy";

export type RateVerdict = { ok: true } | { ok: false; message: string };

/**
 * Count one use of an allowance and say whether it was within it.
 *
 * Fails OPEN. This is abuse control, not a security control: if the counter
 * query errors, a legitimate review should still post rather than the site
 * appearing broken. Every caller is already behind an auth and permission
 * check that does fail closed.
 */
export async function checkRateLimit(
  bucket: Bucket,
  user: CurrentUser | null,
): Promise<RateVerdict> {
  if (!user) return { ok: true };
  // Admins moderate in bursts; limiting them would only get in your own way.
  if (isAdmin(user)) return { ok: true };

  const { limit, windowSeconds, message } = LIMITS[bucket];
  const now = new Date();
  const windowStart = windowStartFor(now, windowSeconds);

  try {
    // One statement, so two concurrent submissions cannot both read "4".
    const [row] = await db
      .insert(rateLimits)
      .values({ bucket, subject: user.id, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.bucket, rateLimits.subject, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    if (withinLimit(row.count, limit)) {
      await sweepOccasionally();
      return { ok: true };
    }

    const wait = retryAfterLabel(
      retryAfterSeconds(now, windowStart, windowSeconds),
    );
    return { ok: false, message: `${message} Try again in about ${wait}.` };
  } catch {
    return { ok: true };
  }
}

/**
 * Drop windows nobody can still be inside.
 *
 * Done here, rarely, rather than as a cron: the table is tiny, and a scheduled
 * job is another thing to own for a delete that takes milliseconds.
 */
async function sweepOccasionally() {
  if (Math.random() > 0.01) return;
  const cutoff = new Date(Date.now() - 2 * 86400 * 1000);
  try {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
  } catch {
    // Housekeeping only — never let it affect the caller.
  }
}

/** Clear an allowance, for tests and for an admin unsticking someone. */
export async function resetRateLimit(bucket: Bucket, subjectId: string) {
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.subject, subjectId)));
}
