"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { comments, discussions, type discussionSubject } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

type SubjectType = (typeof discussionSubject.enumValues)[number];

type Ctx = {
  subjectType: SubjectType;
  subjectId: string;
  revalidate: string;
};

const MAX_LEN = 4000;

export type FormResult = { error?: string; ok?: boolean };

export async function postComment(
  ctx: Ctx,
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to comment." };

  const body = String(formData.get("body") ?? "").trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_LEN) return { error: "That comment is too long." };

  const discussion =
    (await db.query.discussions.findFirst({
      where: and(
        eq(discussions.subjectType, ctx.subjectType),
        eq(discussions.subjectId, ctx.subjectId),
      ),
    })) ??
    (
      await db
        .insert(discussions)
        .values({ subjectType: ctx.subjectType, subjectId: ctx.subjectId })
        .onConflictDoNothing()
        .returning()
    )[0] ??
    (await db.query.discussions.findFirst({
      where: and(
        eq(discussions.subjectType, ctx.subjectType),
        eq(discussions.subjectId, ctx.subjectId),
      ),
    }));

  if (!discussion) return { error: "Could not open the thread." };
  if (discussion.locked) return { error: "This thread is locked." };

  if (parentId) {
    const parent = await db.query.comments.findFirst({
      where: eq(comments.id, parentId),
    });
    // one level of nesting only — a reply to a reply attaches to the root
    const attachTo = parent?.parentId ?? parentId;
    await db
      .insert(comments)
      .values({ discussionId: discussion.id, parentId: attachTo, authorId: user.id, body });
  } else {
    await db
      .insert(comments)
      .values({ discussionId: discussion.id, authorId: user.id, body });
  }

  revalidatePath(ctx.revalidate);
  return { ok: true };
}

export async function hideComment(
  revalidate: string,
  commentId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
  });
  if (!comment || comment.authorId !== user.id) return;

  await db
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenBy: user.id })
    .where(eq(comments.id, commentId));

  revalidatePath(revalidate);
}
