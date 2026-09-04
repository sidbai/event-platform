import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { clubs } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

/**
 * Who may edit a club entry.
 *
 * A club page is shared ground — it carries other people's reviews of a real
 * organisation — so it is not open to anyone the way a forum post is. Whoever
 * added it can correct their own entry, and admins can fix anything.
 */
export async function canEditClub(slug: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { createdBy: true },
  });
  return club?.createdBy === user.id;
}
