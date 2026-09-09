import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { randomBytes } from "node:crypto";

import { generatedUsername } from "@/lib/username";

async function taken(username: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * A unique username for somebody who has not chosen one.
 *
 * Random, not derived from the account: an account is created the moment
 * somebody signs in, before they have decided anything, and a handle worked
 * out from their email address publishes them by default. They can pick a
 * real one whenever they like, in settings.
 *
 * The unique constraint on the column is the actual guard; the loop covers a
 * collision rather than trusting 16 million to be enough on its own.
 */
export async function generateAnonymousUsername(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = generatedUsername(randomBytes(3).toString("hex"));
    if (!(await taken(candidate))) return candidate;
  }
  return generatedUsername(randomBytes(6).toString("hex"));
}

export async function usernameAvailable(
  username: string,
  exceptUserId?: string,
): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true },
  });
  return !row || row.id === exceptUserId;
}
