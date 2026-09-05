import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { reviewCoach } from "@/features/coaches/actions";
import { recentSeasons } from "@/features/coaches/constants";
import { canReviewCoach } from "@/features/coaches/claim";
import { getCoach, myCoachReview } from "@/features/coaches/queries";
import { CoachReviewForm } from "@/features/coaches/review-form";
import type { Ratings } from "@/features/reviews/constants";
import { anonymousReviewsEnabled } from "@/features/reviews/anon-gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your experience" };

export default async function ReviewCoachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  /*
   * Open to everyone: the account is asked for at the moment of posting, so a
   * parent finds out after writing rather than before. reviewCoach still
   * refuses a signed-out submission, so this is presentation, not permission.
   */
  const user = await getCurrentUser();

  const coach = await getCoach(slug);
  if (!coach) notFound();
  // A coach who has claimed their page cannot review themselves. Only checked
  // once we know who is asking — signed out, there is nobody to be.
  if (user && !canReviewCoach(coach, { id: user.id, admin: false })) notFound();

  const existing = user ? await myCoachReview(coach.id, user.id) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/coaches/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {coach.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Your experience with {coach.name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {coach.club?.name}
        {existing && " · you're editing the review you already left"}
      </p>

      <CoachReviewForm
        action={reviewCoach.bind(null, slug)}
        seasons={recentSeasons()}
        slug={slug}
        signedIn={Boolean(user)}
        /* Only offered when the server would actually accept it, so the
           button never promises something that cannot work. */
        allowAnonymous={anonymousReviewsEnabled()}
        existing={
          existing
            ? {
                ratings: existing.ratings as Ratings,
                reviewerRole: existing.reviewerRole,
                title: existing.title,
                body: existing.body,
                teamLabel: existing.teamLabel,
                season: existing.season,
                yearsWith: existing.yearsWith,
                recommends: existing.recommends,
              }
            : null
        }
      />
    </div>
  );
}
