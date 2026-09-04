import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { comments, discussions, type discussionSubject } from "@/db/schema";
import { publicName } from "@/features/auth";

type SubjectType = (typeof discussionSubject.enumValues)[number];

export type ThreadComment = {
  id: string;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
  /** All null once removed — a tombstone carries no identity. */
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  authorImage: string | null;
  replies: ThreadComment[];
};

export async function getThread(subjectType: SubjectType, subjectId: string) {
  const discussion = await db.query.discussions.findFirst({
    where: and(
      eq(discussions.subjectType, subjectType),
      eq(discussions.subjectId, subjectId),
    ),
  });

  if (!discussion) {
    return {
      discussion: null,
      comments: [] as ThreadComment[],
      count: 0,
      pinnedId: null as string | null,
    };
  }

  const rows = await db.query.comments.findMany({
    where: eq(comments.discussionId, discussion.id),
    orderBy: [asc(comments.createdAt)],
    with: {
      author: {
        columns: {
          name: true,
          displayName: true,
          username: true,
          image: true,
          avatarUrl: true,
        },
      },
    },
  });

  const byId = new Map<string, ThreadComment>();
  for (const row of rows) {
    const hidden = Boolean(row.hiddenAt);
    byId.set(row.id, {
      id: row.id,
      // A removed comment keeps its place so replies still make sense, but
      // nothing about it leaves the server: not the text, not who wrote it.
      // Hiding it in the markup alone would still ship both to the browser in
      // the payload, where anyone can read them.
      body: hidden ? "" : row.body,
      createdAt: row.createdAt,
      hiddenAt: row.hiddenAt,
      authorId: hidden ? null : row.authorId,
      authorName: hidden ? null : row.author ? publicName(row.author) : "Someone",
      authorUsername: hidden ? null : (row.author?.username ?? null),
      // Custom uploads only. The Google photo is deliberately never shown.
      authorImage: hidden ? null : (row.author?.avatarUrl ?? null),
      replies: [],
    });
  }

  const roots: ThreadComment[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  return {
    discussion,
    comments: roots,
    count: rows.filter((r) => !r.hiddenAt).length,
    pinnedId: discussion.pinnedCommentId,
  };
}
