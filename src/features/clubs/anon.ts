import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";


/**
 * A stable pseudonym for reviews, of any subject.
 *
 * Deliberately opaque: no adjective-animal pairing that people start treating
 * as a nickname, and nothing derived from the account, so it cannot be
 * reversed. Generated once per user and reused, which means one person's
 * reviews are linkable to each other but not to their identity.
 */
export function generateAnonHandle(): string {
  return `anon-${randomBytes(4).toString("hex")}`;
}

/**
 * Make sure the user has a pseudonym, creating one on first review.
 *
 * Generated lazily rather than at signup so accounts that predate reviews get
 * one too. The unique constraint is the real guard; the retry covers the
 * astronomically unlikely collision rather than trusting randomness alone.
 */
export async function ensureAnonHandle(userId: string, existing: string | null) {
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const handle = generateAnonHandle();
    try {
      await db.update(users).set({ anonHandle: handle }).where(eq(users.id, userId));
      return handle;
    } catch {
      // unique violation — try another
    }
  }
  throw new Error("Could not allocate an anonymous handle.");
}
