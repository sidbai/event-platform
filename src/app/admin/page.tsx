import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  pendingEvents,
  reportedComments,
  unverifiedClaims,
} from "@/features/admin/queries";
import { hideComment } from "@/features/discussion/actions";
import { approveEvent, rejectEvent } from "@/features/events/actions";
import { rejectClaim, verifyTeam } from "@/features/teams/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const [events, claims, reports] = await Promise.all([
    pendingEvents(),
    unverifiedClaims(),
    reportedComments(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Pending events{" "}
          {events.length > 0 && <span className="text-muted">({events.length})</span>}
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
              >
                <div>
                  <Link
                    href={`/events/${event.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {event.title}
                  </Link>
                  <div className="text-xs text-muted">
                    {event.kind}
                    {event.venue && ` · ${event.venue.name}`}
                    {event.onlineUrl && " · online"}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <form action={approveEvent.bind(null, event.slug)}>
                    <button className="rounded-md bg-brand px-3 py-1 font-medium text-white hover:bg-brand-strong">
                      Approve
                    </button>
                  </form>
                  <form action={rejectEvent.bind(null, event.slug)}>
                    <button className="rounded-md border border-line px-3 py-1 hover:bg-elevated">
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Team claims{" "}
          {claims.length > 0 && <span className="text-muted">({claims.length})</span>}
        </h2>
        {claims.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No claims to verify.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {claims.map((team) => (
              <li
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
              >
                <Link
                  href={`/teams/${team.slug}`}
                  className="font-medium text-brand-text hover:underline"
                >
                  {team.name}
                </Link>
                <div className="flex gap-2 text-sm">
                  <form action={verifyTeam.bind(null, team.id)}>
                    <button className="rounded-md bg-brand px-3 py-1 font-medium text-white hover:bg-brand-strong">
                      Verify
                    </button>
                  </form>
                  <form action={rejectClaim.bind(null, team.id)}>
                    <button className="rounded-md border border-line px-3 py-1 hover:bg-elevated">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Reported comments{" "}
          {reports.length > 0 && <span className="text-muted">({reports.length})</span>}
        </h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing reported.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reports.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-line p-3"
              >
                <div className="text-xs text-muted">
                  {comment.author ? publicName(comment.author) : "Someone"} ·{" "}
                  {comment.reportCount} report{comment.reportCount > 1 ? "s" : ""} ·{" "}
                  {comment.discussion?.subjectType}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
                <form
                  action={hideComment.bind(null, "/admin", comment.id)}
                  className="mt-2"
                >
                  <button className="text-sm text-red-600 hover:underline dark:text-red-400">
                    Remove comment
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
