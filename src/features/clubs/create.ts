import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { clubEdits, clubs } from "@/db/schema";
import { slugify } from "@/lib/slug";

/**
 * Adding a club to the directory.
 *
 * Two ways in — the public form at /clubs/new and the admin queue, where the
 * club being missing is the reason a hundred teams have nowhere to go — and
 * both have to produce the same row. A club with no first history entry
 * cannot be reverted, and one whose slug collided would be unreachable, so
 * neither is a detail a caller should be trusted to remember.
 */

export type NewClub = {
  name: string;
  city?: string | null;
  website?: string | null;
  crestUrl?: string | null;
};

/** A slug nothing else holds. */
async function freeSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "club";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.query.clubs.findFirst({
      where: eq(clubs.slug, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createClubRow(
  input: NewClub,
  byUserId: string,
): Promise<{ id: string; slug: string; name: string }> {
  const slug = await freeSlug(input.name);
  const snapshot = {
    name: input.name,
    city: input.city ?? null,
    website: input.website ?? null,
    crestUrl: input.crestUrl ?? null,
  };

  const [club] = await db
    .insert(clubs)
    .values({ slug, ...snapshot, createdBy: byUserId, updatedBy: byUserId })
    .returning({ id: clubs.id });

  // The club's first history row, so there is always something to revert to.
  await db
    .insert(clubEdits)
    .values({
      clubId: club.id,
      editedBy: byUserId,
      ...snapshot,
      summary: "Added the club",
    });

  return { id: club.id, slug, name: input.name };
}
