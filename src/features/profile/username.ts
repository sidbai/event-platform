import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { normalizeUsername } from "@/lib/username";

async function taken(username: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true },
  });
  return Boolean(row);
}

/** A unique username derived from a seed (email local-part or name). */
export async function generateUsername(seed: string): Promise<string> {
  let root = normalizeUsername(seed);
  if (root.length < 3) root = `${root}user`.slice(0, 30);

  for (let i = 0; i < 100; i++) {
    const candidate = (i === 0 ? root : `${root}${i + 1}`).slice(0, 30);
    if (!(await taken(candidate))) return candidate;
  }
  return `${root}${Date.now().toString(36)}`.slice(0, 30);
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
