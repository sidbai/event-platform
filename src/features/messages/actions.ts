"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  messageBlocks,
  messageReports,
  messages,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { checkRateLimit } from "@/features/rate-limit";

import { canPostMessage, canReadConversation, canStartConversation } from "./access";
import { blockedBy, findExisting, getConversation } from "./queries";
import { resolveSubject, type SubjectType } from "./subjects";

const BODY_MAX = 4000;

export type MessageResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const REFUSALS: Record<string, string> = {
  "signed-out": "Sign in to send a message.",
  "no-subject": "You can't message about that.",
  "no-recipients": "There's nobody to message about this yet.",
  self: "You run this — there's nobody to message.",
  blocked: "You can't message this person.",
};

/**
 * Open (or reopen) the conversation about a subject and post the first message.
 *
 * Reuses an existing thread rather than starting a second one, so a subject
 * does not accumulate parallel conversations between the same people.
 */
export async function startConversation(
  subjectType: SubjectType,
  slug: string,
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const subject = await resolveSubject(subjectType, slug, user);
  if (!subject) return { error: "That's gone." };

  const verdict = canStartConversation(
    { id: user.id, admin: isAdmin(user) },
    {
      recipientIds: subject.recipientIds,
      blockedByIds: await blockedBy(user.id),
      canSeeSubject: subject.canSee,
    },
  );
  if (!verdict.ok) return { error: REFUSALS[verdict.reason] };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2) return { fieldErrors: { body: "Write a message first." } };
  if (body.length > BODY_MAX) return { fieldErrors: { body: "That's too long." } };

  const gate = await checkRateLimit("message:send", user);
  if (!gate.ok) return { error: gate.message };

  let conversationId = await findExisting(subjectType, subject.id, user.id);
  if (!conversationId) {
    const [created] = await db
      .insert(conversations)
      .values({ subjectType, subjectId: subject.id, startedBy: user.id })
      .returning({ id: conversations.id });
    conversationId = created.id;
    await db.insert(conversationParticipants).values(
      [user.id, ...verdict.recipientIds].map((userId) => ({
        conversationId: created.id,
        userId,
      })),
    );
  }

  await db.insert(messages).values({ conversationId, authorId: user.id, body });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function sendMessage(
  conversationId: string,
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const convo = await getConversation(conversationId);
  if (!convo) return { error: "That conversation is gone." };

  const viewer = { id: user.id, admin: isAdmin(user) };
  if (!canPostMessage(convo.participantIds, viewer, await blockedBy(user.id)))
    return { error: "You can't post here." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { fieldErrors: { body: "Write a message first." } };
  if (body.length > BODY_MAX) return { fieldErrors: { body: "That's too long." } };

  const gate = await checkRateLimit("message:send", user);
  if (!gate.ok) return { error: gate.message };

  await db.insert(messages).values({ conversationId, authorId: user.id, body });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { ok: true };
}

/** Mark a thread read for this person. Called when they open it. */
export async function markRead(conversationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    );
}

/**
 * Refuse further contact from the other people in a thread.
 *
 * Blocks the person, not the thread: what was already said stays, because an
 * admin needs the history to judge a report against.
 */
export async function blockFromConversation(
  conversationId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const convo = await getConversation(conversationId);
  if (!convo) return;
  if (!canReadConversation(convo.participantIds, { id: user.id, admin: false }))
    return;

  const others = convo.participantIds.filter((id) => id !== user.id);
  if (others.length === 0) return;

  await db
    .insert(messageBlocks)
    .values(others.map((blockedId) => ({ blockerId: user.id, blockedId })))
    .onConflictDoNothing();

  revalidatePath(`/messages/${conversationId}`);
}

export async function unblockFromConversation(
  conversationId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const convo = await getConversation(conversationId);
  if (!convo) return;

  for (const other of convo.participantIds.filter((id) => id !== user.id)) {
    await db
      .delete(messageBlocks)
      .where(
        and(
          eq(messageBlocks.blockerId, user.id),
          eq(messageBlocks.blockedId, other),
        ),
      );
  }
  revalidatePath(`/messages/${conversationId}`);
}

/**
 * Report a message to an admin.
 *
 * This is the only route by which a private message reaches a moderator — an
 * admin cannot browse inboxes, so reporting is a deliberate act that leaves a
 * record rather than a standing permission.
 */
export async function reportMessage(
  conversationId: string,
  messageId: string,
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const convo = await getConversation(conversationId);
  if (!convo) return;
  if (!canReadConversation(convo.participantIds, { id: user.id, admin: false }))
    return;

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;
  await db
    .insert(messageReports)
    .values({ messageId, reporterId: user.id, reason })
    .onConflictDoNothing();

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/admin");
}

/** Admin: hide a reported message without destroying the record. */
export async function hideMessage(messageId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;
  await db
    .update(messages)
    .set({ hiddenAt: new Date() })
    .where(eq(messages.id, messageId));
  revalidatePath("/admin");
}

/** Admin: leave a reported message up and clear its reports. */
export async function dismissMessageReports(messageId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;
  await db.delete(messageReports).where(eq(messageReports.messageId, messageId));
  revalidatePath("/admin");
}
