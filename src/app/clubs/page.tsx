import Link from "next/link";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { listClubs } from "@/features/clubs/queries";
import { ReviewsHeader } from "@/features/reviews/reviews-header";
import { Stars } from "@/features/clubs/stars";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reviews",
  description:
    "Anonymous reviews of Seattle-area youth soccer clubs, from the families who play there.",
};

export default async function ClubsPage() {
  const clubs = await listClubs();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <ReviewsHeader
        active="clubs"
        action={{ href: "/clubs/new", label: "Add a club" }}
      />

      {clubs.length === 0 ? (
        <p className="mt-10 text-muted">
          No clubs yet.{" "}
          <Link href="/clubs/new" className="text-brand-text hover:underline">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.slug}`}
                className="flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-card p-5 text-center transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                <TeamCrest src={club.crestUrl} size={56} />
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{club.name}</div>
                  {club.city && (
                    <div className="text-xs text-muted">{club.city}</div>
                  )}
                </div>

                {/* Pushed to the bottom so ratings line up across a row even
                    when club names wrap to two lines. */}
                <div className="mt-auto pt-1">
                  {club.summary?.rated ? (
                    <>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-lg font-semibold tabular-nums">
                          {club.summary.overall.toFixed(1)}
                        </span>
                        <span className="text-amber-500">
                          <Stars value={club.summary.overall} />
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {club.summary.count} review
                        {club.summary.count === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : club.summary ? (
                    // Reviews exist but too few to average — say so rather
                    // than showing a number one person decided.
                    <>
                      <div className="text-sm text-muted">Not rated yet</div>
                      <div className="text-xs text-muted">
                        {club.summary.count} review
                        {club.summary.count === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted">No reviews yet</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
