import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { listConversations } from "@/features/messages/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages" };

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

export default async function MessagesPage() {
  const user = await requireUser("/messages");
  const conversations = await listConversations(user.id);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-1 text-sm text-muted">
        Conversations about events and teams you&rsquo;re involved in. Start one
        from an event or team page.
      </p>

      {conversations.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing here yet. Open an{" "}
          <Link href="/events" className="text-brand-text hover:underline">
            event
          </Link>{" "}
          and use &ldquo;Message the organizer&rdquo;.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className="block py-3 transition-colors hover:bg-elevated"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {c.unread && (
                      <span
                        aria-label="Unread"
                        className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand align-middle"
                      />
                    )}
                    {c.with.length > 0 ? c.with.join(", ") : "Conversation"}
                  </span>
                  <span className="text-xs text-muted">{fmt(c.lastMessageAt)}</span>
                </div>
                {c.preview && (
                  <p className="mt-0.5 truncate text-sm text-muted">{c.preview}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
