import "server-only";

import { getCurrentUser } from "@/features/auth";

/**
 * Who may edit a club entry.
 *
 * Club entries are community maintained, like a wiki page: anyone signed in
 * can correct a name, city, website or logo. They describe real organisations
 * that none of us run, so gatekeeping them to whoever happened to type the
 * name in first would leave most entries wrong forever.
 *
 * The trade is vandalism, and it is handled by attribution rather than
 * permission — every edit records who made it (clubs.updatedBy) and is shown
 * on the club page. Reviews are untouched by this: those stay one-per-author
 * and only their author or an admin can change them.
 */
export async function canEditClub(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user);
}
