import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { reportReview, setReviewHidden, toggleHelpful } from "@/features/clubs/actions";
import { MIN_REVIEWS_FOR_SCORE, overallOf } from "@/features/clubs/constants";
import { clubSummary, getClub, listReviews } from "@/features/clubs/queries";
import { HelpfulButton, ReportControl } from "@/features/clubs/review-card";
import { RatingBreakdown, Stars } from "@/features/clubs/stars";
import { CreateLink } from "@/components/create-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) return { title: "Not found" };
  return {
    title: `${club.name} reviews`,
    description: `What families say about ${club.name}.`,
  };
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

export default async function ClubReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [club, user] = await Promise.all([getClub(slug), getCurrentUser()]);
  if (!club) notFound();
  const admin = isAdmin(user);

  const [summary, reviews] = await Promise.all([
    clubSummary(club.id),
    // Admins see hidden reviews too, badged, so a takedown can be undone from
    // the page it happened on rather than only from the queue.
    listReviews(club.id, user?.id ?? null, admin),
  ]);
  const mine = reviews.find((r) => r.mine);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <section className="min-w-0 flex-1 rounded-xl border border-line bg-card p-5">
          {summary?.rated ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-semibold tabular-nums">{summary.overall.toFixed(1)}</span>
                <span className="text-amber-500">
                  <Stars value={summary.overall} size={18} />
                </span>
                <span className="text-sm text-muted">
                  {summary.count} review{summary.count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <RatingBreakdown ratings={summary.byScale} />
              </div>
            </>
          ) : summary ? (
            // The reviews themselves still render below; only the average is
            // withheld, because a mean of one or two is not a rating.
            <div className="text-sm text-muted">
              <span className="font-medium text-ink">Not rated yet</span> — {summary.count} review
              {summary.count === 1 ? "" : "s"} so far. We show a score once there are{" "}
              {MIN_REVIEWS_FOR_SCORE}.
            </div>
          ) : (
            <p className="text-sm text-muted">
              No reviews yet. Written anonymously by local parents and players — be the first.
            </p>
          )}
        </section>
        {/* The plus is for making one. Once you have written a review the
            same control edits it, and a plus there would describe the wrong
            action — so only the new case gets the pill. */}
        {mine ? (
          <Link
            href={`/clubs/${slug}/review`}
            className="rounded-full border border-line px-3 py-1 text-sm font-medium text-brand-text hover:bg-elevated"
          >
            Edit your review
          </Link>
        ) : (
          <CreateLink href={`/clubs/${slug}/review`}>Write a review</CreateLink>
        )}
      </div>

      {reviews.length > 0 && (
        <ul className="mt-6 space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={
                r.hidden
                  ? "rounded-xl border border-amber-300 bg-amber-50/40 p-4"
                  : "rounded-xl border border-line bg-card p-4"
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {r.hidden && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    Hidden — only admins see this
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-amber-500">
                  <Stars value={overallOf("club", r.ratings)} />
                  <span className="tabular-nums text-ink">{overallOf("club", r.ratings).toFixed(1)}</span>
                </span>
                <span>·</span>
                <span className="rounded-full bg-elevated px-2 py-0.5 capitalize" title="Self-reported — we can't verify this">
                  {r.reviewerRole}
                </span>
                <span>·</span>
                <span className="font-mono">{r.anonHandle}</span>
                <span>·</span>
                <span>{fmt(r.createdAt)}</span>
                {r.mine && <span className="rounded-full bg-elevated px-2 py-0.5">yours</span>}
              </div>

              <h2 className="mt-2 font-medium leading-snug">{r.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-ink">Category ratings</summary>
                <div className="mt-2">
                  <RatingBreakdown ratings={r.ratings} showValues={false} />
                </div>
              </details>

              {user && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <HelpfulButton count={r.helpful} voted={r.votedByMe} action={toggleHelpful.bind(null, slug, r.id)} />
                  {!r.mine && <ReportControl reported={false} action={reportReview.bind(null, slug, r.id)} />}
                  {admin && (
                    <form action={setReviewHidden.bind(null, r.id, !r.hidden, `/clubs/${slug}/reviews`)}>
                      <button
                        className={r.hidden ? "text-xs text-muted hover:text-ink" : "text-xs text-muted hover:text-red-600"}
                      >
                        {r.hidden ? "Put it back up" : "Hide this review"}
                      </button>
                    </form>
                  )}
                </div>
              )}
              {!user && r.helpful > 0 && <p className="mt-3 text-xs text-muted">{r.helpful} found this helpful</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
