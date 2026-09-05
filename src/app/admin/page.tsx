import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  pendingEvents,
  recentClubEdits,
  reportedComments,
  reportedReviews,
} from "@/features/admin/queries";
import { dismissReviewReports, hideReview } from "@/features/clubs/actions";
import { hideComment } from "@/features/discussion/actions";
import { approveEvent, rejectEvent } from "@/features/events/actions";
import {
  approveCoachClaim,
  rejectCoachClaim,
  restoreReview,
} from "@/features/coaches/actions";
import { pendingCoachClaims } from "@/features/coaches/queries";
import { approveNewsPost, rejectNewsPost } from "@/features/news/actions";
import { pendingNews } from "@/features/news/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const [events, news, claims, reports, reviewReports, clubEdits] =
    await Promise.all([
      pendingEvents(),
      pendingNews(),
      pendingCoachClaims(),
      reportedComments(),
      reportedReviews(),
      recentClubEdits(),
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
                    <button className="rounded-md bg-brand px-3 py-1 font-semibold text-on-brand hover:bg-brand-strong">
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
          News submissions{" "}
          {news.length > 0 && <span className="text-muted">({news.length})</span>}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Anyone can write a post; nothing reaches News until it is approved
          here.
        </p>
        {news.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {news.map((post) => (
              <li key={post.id} className="rounded-lg border border-line p-3">
                <Link
                  href={`/news/${post.slug}`}
                  className="font-medium text-brand-text hover:underline"
                >
                  {post.title}
                </Link>
                <div className="text-xs text-muted">
                  {post.author ? publicName(post.author) : "Unknown"} ·{" "}
                  {post.category}
                </div>
                <p className="mt-1 text-sm text-muted">{post.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <form action={approveNewsPost.bind(null, post.slug)}>
                    <button className="rounded-md bg-brand px-3 py-1 font-semibold text-on-brand hover:bg-brand-strong">
                      Publish
                    </button>
                  </form>
                  <form
                    action={rejectNewsPost.bind(null, post.slug)}
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      name="note"
                      placeholder="Why it is going back (optional)"
                      className="min-w-0 flex-1 rounded-md border border-line bg-card px-2 py-1 text-sm"
                    />
                    <button className="rounded-md border border-line px-3 py-1 hover:bg-elevated">
                      Send back
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
          Coach claims{" "}
          {claims.length > 0 && <span className="text-muted">({claims.length})</span>}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Approving lets this person respond publicly to reviews about them. It
          does not let them edit or remove any review.
        </p>
        {claims.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {claims.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3">
                <div className="text-sm">
                  <span className="font-medium">{c.who}</span>
                  {c.email && <span className="text-muted"> · {c.email}</span>}
                  <span className="text-muted"> says they are </span>
                  <Link
                    href={`/coaches/${c.coach?.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {c.coach?.name}
                  </Link>
                </div>
                {c.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {c.note}
                  </p>
                )}
                <div className="mt-2 flex gap-4 text-sm">
                  <form action={approveCoachClaim.bind(null, c.id)}>
                    <button className="rounded-md bg-brand px-3 py-1 font-semibold text-on-brand hover:bg-brand-strong">
                      Approve
                    </button>
                  </form>
                  <form action={rejectCoachClaim.bind(null, c.id)}>
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
                  <button className="text-sm text-red-600 hover:underline">
                    Remove comment
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Reported reviews{" "}
          {reviewReports.length > 0 && (
            <span className="text-muted">({reviewReports.length})</span>
          )}
        </h2>
        {reviewReports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing reported.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reviewReports.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>
                    {r.subject?.name ?? "Unknown"} ({r.subjectType}) ·{" "}
                    {r.reportCount} report{r.reportCount > 1 ? "s" : ""}
                    {r.reasons.length > 0 && ` · ${r.reasons.join(", ")}`}
                  </span>
                  {r.hidden && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      Auto-hidden — awaiting your decision
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium">{r.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                  {r.body}
                </p>
                <div className="mt-2 flex gap-4 text-sm">
                  {r.hidden ? (
                    <form action={restoreReview.bind(null, r.id)}>
                      <button className="font-medium text-brand-text hover:underline">
                        Put it back up
                      </button>
                    </form>
                  ) : (
                    <form action={hideReview.bind(null, r.id)}>
                      <button className="text-red-600 hover:underline">
                        Hide review
                      </button>
                    </form>
                  )}
                  <form action={dismissReviewReports.bind(null, r.id)}>
                    <button className="text-muted hover:text-ink">
                      {r.hidden ? "Keep it hidden" : "Dismiss reports"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent club edits</h2>
        <p className="mt-1 text-sm text-muted">
          Club details are community maintained. Nothing here needs approving —
          this is just so you can see what changed.
        </p>
        {clubEdits.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No edits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {clubEdits.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/clubs/${e.club?.slug}`}
                  className="font-medium text-brand-text hover:underline"
                >
                  {e.club?.name}
                </Link>
                <span className="text-muted">{e.summary}</span>
                <span className="text-muted">·</span>
                <span className="text-muted">
                  {e.editor ? publicName(e.editor) : "someone"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
