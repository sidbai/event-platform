import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { comments, events } from "@/db/schema";

export async function pendingEvents() {
  return db.query.events.findMany({
    where: eq(events.status, "pending"),
    orderBy: [desc(events.createdAt)],
    with: {
      venue: { columns: { name: true, city: true } },
    },
  });
}

export async function reportedComments() {
  return db.query.comments.findMany({
    where: and(gt(comments.reportCount, 0), isNull(comments.hiddenAt)),
    orderBy: [desc(comments.reportCount)],
    with: {
      author: { columns: { name: true, displayName: true, username: true, email: true } },
      discussion: { columns: { subjectType: true, subjectId: true } },
    },
  });
}
