import "server-only";

import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { comments, events, teams } from "@/db/schema";

export async function pendingEvents() {
  return db.query.events.findMany({
    where: eq(events.status, "pending"),
    orderBy: [desc(events.createdAt)],
    with: {
      venue: { columns: { name: true, city: true } },
    },
  });
}

export async function unverifiedClaims() {
  return db.query.teams.findMany({
    where: and(isNotNull(teams.claimedBy), isNull(teams.verifiedAt)),
    orderBy: [desc(teams.updatedAt)],
  });
}

export async function reportedComments() {
  return db.query.comments.findMany({
    where: and(gt(comments.reportCount, 0), isNull(comments.hiddenAt)),
    orderBy: [desc(comments.reportCount)],
    with: {
      author: { columns: { name: true, email: true } },
      discussion: { columns: { subjectType: true, subjectId: true } },
    },
  });
}
