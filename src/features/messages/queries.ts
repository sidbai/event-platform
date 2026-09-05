import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  messageBlocks,
  messages,
} from "@/db/schema";
import { publicName } from "@/features/auth";

import { isUnread } from "./access";
import { namesFor } from "./subjects";

/** Ids of everyone who has blocked this user. */
export async function blockedBy(userId: string): Promise<string[]> {
  const rows = await db.query.messageBlocks.findMany({
    where: eq(messageBlocks.blockedId, userId),
    columns: { blockerId: true },
  });
  return rows.map((r) => r.blockerId);
}

/** Ids this user has blocked. */
export async function blocking(userId: string): Promise<string[]> {
  const rows = await db.query.messageBlocks.findMany({
    where: eq(messageBlocks.blockerId, userId),
    columns: { blockedId: true },
  });
  return rows.map((r) => r.blockedId);
}

async function participantIdsOf(conversationId: string) {
  const rows = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.conversationId, conversationId),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function getConversation(id: string) {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  });
  if (!convo) return null;
  return { ...convo, participantIds: await participantIdsOf(id) };
}

/** The signed-in user's threads, newest activity first. */
export async function listConversations(userId: string) {
  const mine = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.userId, userId),
    columns: { conversationId: true, lastReadAt: true },
  });
  if (mine.length === 0) return [];

  const ids = mine.map((m) => m.conversationId);
  const readAt = new Map(mine.map((m) => [m.conversationId, m.lastReadAt]));

  const rows = await db.query.conversations.findMany({
    where: inArray(conversations.id, ids),
    orderBy: [desc(conversations.lastMessageAt)],
  });

  // Latest visible message per thread, for the preview and the unread check.
  const latest = await db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
      rank: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`,
    })
    .from(messages)
    .where(and(inArray(messages.conversationId, ids), isNull(messages.hiddenAt)))
    .then((all) => all.filter((m) => Number(m.rank) === 1));
  const lastByConvo = new Map(latest.map((m) => [m.conversationId, m]));

  const others = await Promise.all(
    ids.map(async (id) => ({ id, users: await participantIdsOf(id) })),
  );
  const nameMap = await namesFor([
    ...new Set(others.flatMap((o) => o.users).filter((u) => u !== userId)),
  ]);
  const othersById = new Map(
    others.map((o) => [
      o.id,
      o.users.filter((u) => u !== userId).map((u) => nameMap.get(u) ?? "Someone"),
    ]),
  );

  return rows.map((c) => {
    const last = lastByConvo.get(c.id);
    return {
      id: c.id,
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      lastMessageAt: c.lastMessageAt,
      preview: last?.body ?? null,
      with: othersById.get(c.id) ?? [],
      unread: last
        ? isUnread(last.createdAt, readAt.get(c.id) ?? null, last.authorId, userId)
        : false,
    };
  });
}

/** How many threads have something new — the badge in the profile menu. */
export async function unreadCount(userId: string): Promise<number> {
  const list = await listConversations(userId);
  return list.filter((c) => c.unread).length;
}

/** Messages in a thread, oldest first. Hidden ones are left out entirely. */
export async function listMessages(conversationId: string) {
  const rows = await db.query.messages.findMany({
    where: and(
      eq(messages.conversationId, conversationId),
      isNull(messages.hiddenAt),
    ),
    orderBy: [messages.createdAt],
    with: {
      author: { columns: { id: true, displayName: true, name: true, username: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    authorId: m.authorId,
    authorName: m.author ? publicName(m.author) : "Someone",
  }));
}

/** An existing thread about this subject that the user is already in. */
export async function findExisting(
  subjectType: "event" | "team" | "offer",
  subjectId: string,
  userId: string,
) {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversations.subjectType, subjectType),
        eq(conversations.subjectId, subjectId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
