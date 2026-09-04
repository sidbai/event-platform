import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  inviteToEvent,
  revokeEventInvite,
} from "@/features/events/invite-actions";
import { listEventInvites } from "@/features/events/invites";
import { CopyLink, InviteForm } from "@/features/events/invite-form";
import { getEventBySlug } from "@/features/events/queries";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite people" };

const VISIBILITY_NOTE: Record<string, string> = {
  private:
    "This event is private — only you and the people below can open it.",
  unlisted:
    "This event is unlisted. Anyone with the link can open it, so inviting is just a convenience.",
  public:
    "This event is public, so anyone can already find it. Inviting just makes sure these people see it.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/invite`);
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  if (event.organizerId !== user.id && !isAdmin(user)) notFound();

  const invites = await listEventInvites(event.id);
  const base = siteUrl();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/events/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Invite people</h1>
      <p className="mt-1 text-sm text-muted">{VISIBILITY_NOTE[event.visibility]}</p>

      <InviteForm action={inviteToEvent.bind(null, slug)} />

      <p className="mt-2 text-xs text-muted">
        Invite by @username, or by email for someone not on the platform yet —
        their invite activates as soon as they sign in with that address. We
        don&rsquo;t send the email for you yet, so copy the link and send it
        however you like.
      </p>

      <h2 className="mt-8 text-lg font-semibold">
        Invited{" "}
        {invites.length > 0 && (
          <span className="text-muted">({invites.length})</span>
        )}
      </h2>

      {invites.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nobody yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{inv.label}</div>
                <div className="text-xs text-muted">
                  {inv.isEmail ? "invited by email" : "invited"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CopyLink url={`${base}/events/${slug}?i=${inv.token}`} />
                <form action={revokeEventInvite.bind(null, slug, inv.id)}>
                  <button className="text-xs text-muted hover:text-red-600">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
