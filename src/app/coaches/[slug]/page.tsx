import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { RatingBreakdown, Stars } from "@/features/clubs/stars";
import { HelpfulButton, ReportControl } from "@/features/clubs/review-card";
import { coachRoleLabel } from "@/features/coaches/constants";
import {
  reportCoachReview,
  revertCoach,
  toggleCoachHelpful,
} from "@/features/coaches/actions";
import {
  coachHistory,
  coachRecommendation,
  coachSummary,
  getCoach,
  listCoachReviews,
} from "@/features/coaches/queries";
import {
  COACH_SCALES,
  MIN_REVIEWS_FOR_SCORE,
  overallOf,
  reportReasonsFor,
} from "@/features/reviews/constants";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const coach = await getCoach(slug);
  if (!coach) return { title: "Coach" };
  return {
    title: `${coach.name} — ${coach.club?.name ?? "Coach"} reviews`,
    description: `Parent and player experiences with ${coach.name} at ${coach.club?.name ?? "their club"}.`,
  };
}

export default async function CoachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const coach = await getCoach(slug);
  if (!coach) notFound();

  const user = await getCurrentUser();
  const [summary, recommendation, reviews, history] = await Promise.all([
    coachSummary(coach.id),
    coachRecommendation(coach.id),
    listCoachReviews(coach.id, user?.id ?? null),
    coachHistory(coach.id),
  ]);

  const mayEdit = Boolean(user);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/coaches" className="text-sm text-brand-text hover:underline">
        ← Coaches
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{coach.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>{coachRoleLabel(coach.role)}</span>
          {coach.club && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/clubs/${coach.club.slug}`}
                className="text-brand-text hover:underline"
              >
                {coach.club.name}
              </Link>
            </>
          )}
          {(coach.ageGroups ?? []).length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{(coach.ageGroups ?? []).join(", ")}</span>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/coaches/${slug}/review`}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            Share your experience
          </Link>
          {mayEdit && (
            <Link
              href={`/coaches/${slug}/edit`}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-elevated"
            >
              Edit details
            </Link>
          )}
        </div>
      </header>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        {summary?.rated ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums">
                {summary.overall.toFixed(1)}
              </span>
              <span className="text-amber-500">
                <Stars value={summary.overall} size={18} />
              </span>
              <span className="text-sm text-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
              {recommendation && (
                <span className="text-sm text-muted">
                  · {Math.round((recommendation.yes / recommendation.total) * 100)}%
                  would recommend
                </span>
              )}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <RatingBreakdown ratings={summary.byScale} scales={COACH_SCALES} />
            </div>
          </>
        ) : summary ? (
          // The reviews below still render; only the number is withheld. One
          // parent must not be able to set a named person's public rating.
          <div className="text-sm text-muted">
            <span className="font-medium text-ink">Not rated yet</span> —{" "}
            {summary.count} review{summary.count === 1 ? "" : "s"} so far. We show
            a score once there are {MIN_REVIEWS_FOR_SCORE}.
          </div>
        ) : (
          <p className="text-sm text-muted">
            No reviews yet.{" "}
            <Link
              href={`/coaches/${slug}/review`}
              className="text-brand-text hover:underline"
            >
              Share your experience
            </Link>
            .
          </p>
        )}
      </section>

      <details className="mt-4 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Coach details are maintained by the community
        </summary>
        <ul className="mt-2 space-y-1">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <span>{fmt(h.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>{h.summary}</span>
              <span aria-hidden>·</span>
              <span>{h.editor}</span>
              {mayEdit && !h.isCurrent && (
                <form action={revertCoach.bind(null, slug, h.id)}>
                  <button className="text-brand-text hover:underline">
                    restore this
                  </button>
                </form>
              )}
              {h.isCurrent && <span>(current)</span>}
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
                  <Stars value={overallOf("coach", r.ratings)} />
                  <span className="tabular-nums text-ink">
                    {overallOf("coach", r.ratings).toFixed(1)}
                  </span>
                </span>
                <span aria-hidden>·</span>
                <span
                  className="rounded-full bg-elevated px-2 py-0.5 capitalize"
                  title="Self-reported — we can't verify this"
                >
                  {r.reviewerRole}
                </span>
                <span aria-hidden>·</span>
                <span className="font-mono">{r.anonHandle}</span>
                <span aria-hidden>·</span>
                <span>{fmt(r.createdAt)}</span>
                {r.mine && (
                  <span className="rounded-full bg-elevated px-2 py-0.5">yours</span>
                )}
              </div>

              {/* The context is the point: it makes this an account of a
                  season with this coach rather than a verdict on a person.
                  Team and tenure are optional, so the separators are built
                  from whatever is actually present rather than hardcoded. */}
              {(() => {
                const parts = [
                  r.teamLabel,
                  r.season,
                  r.yearsWith
                    ? `${r.yearsWith} season${r.yearsWith === 1 ? "" : "s"} together`
                    : null,
                  r.recommends === null
                    ? null
                    : r.recommends
                      ? "👍 Recommends"
                      : "👎 Doesn't recommend",
                ].filter(Boolean) as string[];
                if (parts.length === 0) return null;
                return (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    {parts.map((part, i) => (
                      <span key={part} className="flex items-center gap-2">
                        {i > 0 && <span aria-hidden>·</span>}
                        {part}
                      </span>
                    ))}
                  </div>
                );
              })()}

              <h2 className="mt-2 font-medium leading-snug">{r.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                  Category ratings
                </summary>
                <div className="mt-2">
                  <RatingBreakdown
                    ratings={r.ratings}
                    scales={COACH_SCALES}
                    showValues={false}
                  />
                </div>
              </details>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <HelpfulButton
                  count={r.helpful}
                  voted={r.votedByMe}
                  action={toggleCoachHelpful.bind(null, slug, r.id)}
                />
                <ReportControl
                  action={reportCoachReview.bind(null, slug, r.id)}
                  reasons={reportReasonsFor("coach")}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
