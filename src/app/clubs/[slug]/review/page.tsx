import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { saveReview } from "@/features/clubs/actions";
import { getClub, myReview } from "@/features/clubs/queries";
import { ReviewForm } from "@/features/clubs/review-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write a review" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/clubs/${slug}/review`);
  const club = await getClub(slug);
  if (!club) notFound();

  const existing = await myReview(club.id, user.id);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/clubs/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {club.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {existing ? "Edit your review" : `Review ${club.name}`}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Posted anonymously — readers see a random handle, never your name or
        photo. You get one review per club, and you can edit it any time.
      </p>

      <ReviewForm
        action={saveReview.bind(null, slug)}
        existing={
          existing
            ? {
                title: existing.title,
                body: existing.body,
                reviewerRole: existing.reviewerRole,
                ratings: existing.ratings,
              }
            : null
        }
      />
    </div>
  );
}
