"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  commentReports,
  comments,
  discussions,
  type discussionSubject,
  events,
  forumPosts,
  teams,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

type SubjectType = (typeof discussionSubject.enumValues)[number];

async function canModerateSubject(
  user: { id: string; email?: string | null },
  subjectType: SubjectType,
  subjectId: string,
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (subjectType === "event") {
    const row = await db.query.events.findFirst({
      where: eq(events.id, subjectId),
      columns: { organizerId: true },
    });
    return row?.organizerId === user.id;
  }
  if (subjectType === "team") {
    const row = await db.query.teams.findFirst({
      where: eq(teams.id, subjectId),
      columns: { claimedBy: true },
    });
    return row?.claimedBy === user.id;
  }
  if (subjectType === "forum_post") {
    const row = await db.query.forumPosts.findFirst({
      where: eq(forumPosts.id, subjectId),
      columns: { authorId: true },
    });
    return row?.authorId === user.id;
  }
  return false;
}

async function getOrCreateDiscussion(subjectType: SubjectType, subjectId: string) {
  const existing = await db.query.discussions.findFirst({
    where: and(
      eq(discussions.subjectType, subjectType),
      eq(discussions.subjectId, subjectId),
    ),
  });
  if (existing) return existing;
  await db
    .insert(discussions)
    .values({ subjectType, subjectId })
    .onConflictDoNothing();
  return db.query.discussions.findFirst({
    where: and(
      eq(discussions.subjectType, subjectType),
      eq(discussions.subjectId, subjectId),
    ),
  });
}

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

  const discussion = await getOrCreateDiscussion(ctx.subjectType, ctx.subjectId);
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

  if (ctx.subjectType === "forum_post") {
    await db
      .update(forumPosts)
      .set({ lastActivityAt: new Date() })
      .where(eq(forumPosts.id, ctx.subjectId));
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
  if (!comment) return;
  if (comment.authorId !== user.id && !isAdmin(user)) return;

  await db
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenBy: user.id })
    .where(eq(comments.id, commentId));

  revalidatePath(revalidate);
}

export async function setThreadLocked(ctx: Ctx, locked: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (!(await canModerateSubject(user, ctx.subjectType, ctx.subjectId))) return;

  const discussion = await getOrCreateDiscussion(ctx.subjectType, ctx.subjectId);
  if (!discussion) return;

  await db.update(discussions).set({ locked }).where(eq(discussions.id, discussion.id));
  revalidatePath(ctx.revalidate);
}

export async function setPinnedComment(
  ctx: Ctx,
  commentId: string | null,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (!(await canModerateSubject(user, ctx.subjectType, ctx.subjectId))) return;

  const discussion = await getOrCreateDiscussion(ctx.subjectType, ctx.subjectId);
  if (!discussion) return;

  await db
    .update(discussions)
    .set({ pinnedCommentId: commentId })
    .where(eq(discussions.id, discussion.id));
  revalidatePath(ctx.revalidate);
}

export async function reportComment(
  revalidate: string,
  commentId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const inserted = await db
    .insert(commentReports)
    .values({ commentId, userId: user.id })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    await db
      .update(comments)
      .set({ reportCount: sql`${comments.reportCount} + 1` })
      .where(eq(comments.id, commentId));
  }

  revalidatePath(revalidate);
}
