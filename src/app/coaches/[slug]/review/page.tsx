import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { reviewCoach } from "@/features/coaches/actions";
import { recentSeasons } from "@/features/coaches/constants";
import { getCoach, myCoachReview } from "@/features/coaches/queries";
import { CoachReviewForm } from "@/features/coaches/review-form";
import type { Ratings } from "@/features/reviews/constants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your experience" };

export default async function ReviewCoachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/coaches/${slug}/review`);

  const coach = await getCoach(slug);
  if (!coach) notFound();

  const existing = await myCoachReview(coach.id, user.id);

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
