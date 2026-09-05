import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { canPostMessage, canReadConversation } from "@/features/messages/access";
import {
  blockFromConversation,
  markRead,
  reportMessage,
  sendMessage,
  unblockFromConversation,
} from "@/features/messages/actions";
import {
  MessageComposer,
  ReportMessage,
} from "@/features/messages/message-form";
import {
  blockedBy,
  blocking,
  getConversation,
  listMessages,
} from "@/features/messages/queries";
import { namesFor } from "@/features/messages/subjects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversation" };

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);

  const convo = await getConversation(id);
  if (!convo) notFound();

  const viewer = { id: user.id, admin: false };
  // Membership is the whole rule — an admin gets here through a report, not
  // by opening someone's thread.
  if (!canReadConversation(convo.participantIds, viewer)) notFound();

  const [items, iBlocked, blockedMe, names] = await Promise.all([
    listMessages(id),
    blocking(user.id),
    blockedBy(user.id),
    namesFor(convo.participantIds.filter((p) => p !== user.id)),
  ]);

  await markRead(id);

  const others = convo.participantIds.filter((p) => p !== user.id);
  const haveBlocked = others.some((o) => iBlocked.includes(o));
  const canPost = canPostMessage(convo.participantIds, viewer, blockedMe);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/messages" className="text-sm text-brand-text hover:underline">
        ← Messages
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {others.map((o) => names.get(o) ?? "Someone").join(", ") ||
              "Conversation"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            About {convo.subjectType === "event" ? "an event" : "a team"}
          </p>
        </div>
        <form
          action={
            haveBlocked
              ? unblockFromConversation.bind(null, id)
              : blockFromConversation.bind(null, id)
          }
        >
          <button className="text-xs text-muted hover:text-red-600">
            {haveBlocked ? "Unblock" : "Block"}
          </button>
        </form>
      </header>

      <ul className="mt-6 space-y-3">
        {items.map((m) => {
          const mine = m.authorId === user.id;
          return (
            <li
              key={m.id}
              className={
                mine
                  ? "ml-8 rounded-lg border border-line bg-elevated p-3"
                  : "mr-8 rounded-lg border border-line bg-card p-3"
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-ink">
                  {mine ? "You" : m.authorName}
                </span>
                <span aria-hidden>·</span>
                <span>{fmt(m.createdAt)}</span>
                {!mine && (
                  <ReportMessage action={reportMessage.bind(null, id, m.id)} />
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{m.body}</p>
            </li>
          );
        })}
      </ul>

      {haveBlocked ? (
        <p className="mt-6 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          You blocked this conversation. Unblock to reply.
        </p>
      ) : canPost ? (
        <MessageComposer
          action={sendMessage.bind(null, id)}
          placeholder="Write a reply…"
          submitLabel="Send"
        />
      ) : (
        <p className="mt-6 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          You can&rsquo;t reply to this conversation.
        </p>
      )}
    </div>
  );
}
