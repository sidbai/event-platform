import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/** The current user's full DB row (profile included), or null. */
export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  return user ?? null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(returnTo?: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/signin?next=${encodeURIComponent(returnTo)}` : "/signin");
  }
  return user;
}

/** A name safe to show in public UI. */
export function publicName(u: {
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  return u.displayName || u.name || (u.username ? `@${u.username}` : null) || "Someone";
}
