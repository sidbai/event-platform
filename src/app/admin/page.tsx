import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  pendingEvents,
  reportedComments,
  unverifiedClaims,
} from "@/features/admin/queries";
import { hideComment } from "@/features/discussion/actions";
import { approveEvent, rejectEvent } from "@/features/events/actions";
import { rejectClaim, verifyTeam } from "@/features/teams/actions";
import { generateWeeklyDraft } from "@/features/weekly/actions";
import { listDraftPosts } from "@/features/weekly/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ weekly?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const { weekly } = await searchParams;
  const [events, claims, reports, drafts] = await Promise.all([
    pendingEvents(),
    unverifiedClaims(),
    reportedComments(),
    listDraftPosts(),
  ]);

  async function runWeeklyGenerate() {
    "use server";
    const result = await generateWeeklyDraft();
    redirect(result.slug ? `/weekly/${result.slug}/edit` : "/admin?weekly=none");
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Youth Soccer Weekly</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <form action={runWeeklyGenerate}>
            <button className="rounded-md bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800">
              Generate this week&rsquo;s draft
            </button>
          </form>
          {weekly === "none" && (
            <span className="text-neutral-500">No upcoming events to feature.</span>
          )}
        </div>
        {drafts.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {drafts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/weekly/${post.slug}`}
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {post.title}
                </Link>{" "}
                <span className="text-neutral-400">draft</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Pending events{" "}
          {events.length > 0 && <span className="text-neutral-400">({events.length})</span>}
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <Link
                    href={`/events/${event.slug}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {event.title}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    {event.kind}
                    {event.venue && ` · ${event.venue.name}`}
                    {event.onlineUrl && " · online"}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <form action={approveEvent.bind(null, event.slug)}>
                    <button className="rounded-md bg-emerald-700 px-3 py-1 font-medium text-white hover:bg-emerald-800">
                      Approve
                    </button>
                  </form>
                  <form action={rejectEvent.bind(null, event.slug)}>
                    <button className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
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
          {claims.length > 0 && <span className="text-neutral-400">({claims.length})</span>}
        </h2>
        {claims.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No claims to verify.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {claims.map((team) => (
              <li
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <Link
                  href={`/teams/${team.slug}`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {team.name}
                </Link>
                <div className="flex gap-2 text-sm">
                  <form action={verifyTeam.bind(null, team.id)}>
                    <button className="rounded-md bg-emerald-700 px-3 py-1 font-medium text-white hover:bg-emerald-800">
                      Verify
                    </button>
                  </form>
                  <form action={rejectClaim.bind(null, team.id)}>
                    <button className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
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
          {reports.length > 0 && <span className="text-neutral-400">({reports.length})</span>}
        </h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing reported.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reports.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="text-xs text-neutral-500">
                  {comment.author?.name ?? comment.author?.email ?? "Someone"} ·{" "}
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
