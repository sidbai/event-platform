"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { likes } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";

import type { LikeSubject } from "./queries";

/**
 * Heart or un-heart something.
 *
 * A toggle rather than separate like/unlike calls, so a double click cannot
 * leave a stray row: the primary key means the state is simply present or not.
 */
export async function toggleLike(
  subjectType: LikeSubject,
  subjectId: string,
  revalidate: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const gate = await checkRateLimit("like:toggle", user);
  if (!gate.ok) return;

  const existing = await db.query.likes.findFirst({
    where: and(
      eq(likes.subjectType, subjectType),
      eq(likes.subjectId, subjectId),
      eq(likes.userId, user.id),
    ),
  });

  if (existing) {
    await db
      .delete(likes)
      .where(
        and(
          eq(likes.subjectType, subjectType),
          eq(likes.subjectId, subjectId),
          eq(likes.userId, user.id),
        ),
      );
  } else {
    await db
      .insert(likes)
      .values({ subjectType, subjectId, userId: user.id })
      .onConflictDoNothing();
  }

  revalidatePath(revalidate);
}
