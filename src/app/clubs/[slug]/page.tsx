import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser, publicName } from "@/features/auth";
import { canEditClub } from "@/features/clubs/access";
import {
  reportReview,
  revertClub,
  toggleHelpful,
} from "@/features/clubs/actions";
import { overallOf } from "@/features/clubs/constants";
import {
  clubHistory,
  clubSummary,
  getClub,
  listReviews,
} from "@/features/clubs/queries";
import { HelpfulButton, ReportControl } from "@/features/clubs/review-card";
import { RatingBreakdown, Stars } from "@/features/clubs/stars";

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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [club, user] = await Promise.all([getClub(slug), getCurrentUser()]);
  if (!club) notFound();

  const [summary, reviews, mayEdit, history] = await Promise.all([
    clubSummary(club.id),
    listReviews(club.id, user?.id ?? null),
    canEditClub(),
    clubHistory(club.id),
  ]);
  const mine = reviews.find((r) => r.mine);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/clubs" className="text-sm text-brand-text hover:underline">
        ← Club Experience
      </Link>

      <header className="mt-4 flex items-start gap-4">
        <TeamCrest src={club.crestUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {club.city && <span>{club.city}</span>}
            {club.city && club.website && <span aria-hidden>·</span>}
            {club.website && (
              <a
                href={club.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-text hover:underline"
              >
                Website
              </a>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Link
            href={`/clubs/${slug}/review`}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            {mine ? "Edit your review" : "Write a review"}
          </Link>
          {mayEdit && (
            <Link
              href={`/clubs/${slug}/edit`}
              className="text-xs text-muted hover:text-ink"
            >
              Edit club details
            </Link>
          )}
        </div>
      </header>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        {summary ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums">
                {summary.overall.toFixed(1)}
              </span>
              <span className="text-amber-500">
                <Stars value={summary.overall} size={18} />
              </span>
              <span className="text-sm text-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <RatingBreakdown ratings={summary.byCategory} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            No reviews yet.{" "}
            <Link
              href={`/clubs/${slug}/review`}
              className="text-brand-text hover:underline"
            >
              Be the first
            </Link>
            .
          </p>
        )}
      </section>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Club details are maintained by the community
          {club.updatedByUser &&
            ` — last edited by ${publicName(club.updatedByUser)}`}
        </summary>
        <p className="mt-2">
          Anyone signed in can correct a club&rsquo;s details, and every change
          is kept. If something looks wrong, put it back.
        </p>
        <ul className="mt-2 space-y-1">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <span>{fmt(h.createdAt)}</span>
              <span>·</span>
              <span>{h.summary}</span>
              <span>·</span>
              <span>{h.editor}</span>
              {mayEdit && !h.isCurrent && (
                <form action={revertClub.bind(null, slug, h.id)}>
                  <button className="text-brand-text hover:underline">
                    restore this
                  </button>
                </form>
              )}
              {h.isCurrent && <span className="text-muted">(current)</span>}
            </li>
          ))}
        </ul>
      </details>

      {reviews.length > 0 && (
        <ul className="mt-8 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="flex items-center gap-1.5 text-amber-500">
                  <Stars value={overallOf(r.ratings)} />
                  <span className="tabular-nums text-ink">
                    {overallOf(r.ratings).toFixed(1)}
                  </span>
                </span>
                <span>·</span>
                <span
                  className="rounded-full bg-elevated px-2 py-0.5 capitalize"
                  title="Self-reported — we can't verify this"
                >
                  {r.reviewerRole}
                </span>
                <span>·</span>
                <span className="font-mono">{r.anonHandle}</span>
                <span>·</span>
                <span>{fmt(r.createdAt)}</span>
                {r.mine && (
                  <span className="rounded-full bg-elevated px-2 py-0.5">yours</span>
                )}
              </div>

              <h2 className="mt-2 font-medium leading-snug">{r.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                  Category ratings
                </summary>
                <div className="mt-2">
                  <RatingBreakdown ratings={r.ratings} showValues={false} />
                </div>
              </details>

              {user && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <HelpfulButton
                    count={r.helpful}
                    voted={r.votedByMe}
                    action={toggleHelpful.bind(null, slug, r.id)}
                  />
                  {!r.mine && (
                    <ReportControl
                      reported={false}
                      action={reportReview.bind(null, slug, r.id)}
                    />
                  )}
                </div>
              )}
              {!user && r.helpful > 0 && (
                <p className="mt-3 text-xs text-muted">
                  {r.helpful} found this helpful
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
