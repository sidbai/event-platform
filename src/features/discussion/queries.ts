import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { comments, discussions, type discussionSubject } from "@/db/schema";

type SubjectType = (typeof discussionSubject.enumValues)[number];

export type ThreadComment = {
  id: string;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
  authorId: string;
  authorName: string | null;
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
    return { discussion: null, comments: [] as ThreadComment[], count: 0 };
  }

  const rows = await db.query.comments.findMany({
    where: eq(comments.discussionId, discussion.id),
    orderBy: [asc(comments.createdAt)],
    with: { author: { columns: { name: true, image: true } } },
  });

  const byId = new Map<string, ThreadComment>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      hiddenAt: row.hiddenAt,
      authorId: row.authorId,
      authorName: row.author?.name ?? null,
      authorImage: row.author?.image ?? null,
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

  return { discussion, comments: roots, count: rows.length };
}
